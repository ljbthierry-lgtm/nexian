/**
 * Landing pages for the buttons inside our emails: `/a/:token`.
 *
 * GET always renders a page with a button; the mutation only happens on POST.
 * That is deliberate — corporate mail scanners and link previewers fetch every
 * URL in an incoming message, and a magic link that acted on GET would be spent
 * before the person ever clicked it.
 */
import { Hono } from "hono";
import type { AppContext, ConsentPurpose } from "../../env";
import { logActivity } from "../../lib/activity";
import { MARKETING_PURPOSES, recordConsent } from "../../lib/consent";
import { first, run } from "../../lib/db";
import { actionPage, esc } from "../../lib/html";
import { suppressEmail } from "../../lib/suppression";
import { consumeActionToken, peekActionToken } from "../notifications/tokens";
import { startPortalSession } from "../portal/session";

export const actionRoutes = new Hono<AppContext>();

const expiredPage = (what: string) =>
  actionPage({
    title: "Link expired",
    heading: "This link has expired",
    body: `<p>${esc(what)}</p>`,
    action: { label: "Go to the registration page", href: "/join" },
    tone: "warn",
  });

interface Named {
  first_name: string;
  email: string;
}

actionRoutes.get("/:token", async (c) => {
  const raw = c.req.param("token");
  const row = await peekActionToken(c.env.DB, raw);
  if (!row) {
    return c.html(
      expiredPage("Links in our emails are personal and time-limited. You can request a new one."),
      410,
    );
  }

  const contact = row.contact_id
    ? await first<Named>(
        c.env.DB,
        `SELECT first_name, email FROM contacts WHERE id = ?`,
        row.contact_id,
      )
    : null;
  const hello = contact?.first_name ? `Hi ${esc(contact.first_name)},` : "Hello,";

  switch (row.purpose) {
    case "portal_link":
      return c.html(
        actionPage({
          title: "Open your profile",
          heading: "Open your Nexian profile",
          body: `<p>${hello} continue to update your day rate, availability, skills and CV.</p>`,
          action: { label: "Open my profile", method: "post" },
        }),
      );

    case "confirm_availability": {
      const profile = row.contact_id
        ? await first<{
            availability: string;
            available_from: string | null;
            daily_rate: number | null;
          }>(
            c.env.DB,
            `SELECT availability, available_from, daily_rate FROM profiles WHERE contact_id = ?`,
            row.contact_id,
          )
        : null;
      return c.html(
        actionPage({
          title: "Confirm your availability",
          heading: "Is this still correct?",
          body: `<p>${hello} we have you as <strong>${esc(describeAvailability(profile))}</strong>${
            profile?.daily_rate ? ` at <strong>€ ${profile.daily_rate}/day</strong>` : ""
          }.</p>`,
          action: { label: "Yes — still correct", method: "post" },
          secondary: { label: "Something changed — update my profile", href: "/join" },
          tone: "good",
        }),
      );
    }

    case "unsubscribe": {
      const scope = readScope(row.payload);
      return c.html(
        actionPage({
          title: "Unsubscribe",
          heading: scope === "all" ? "Stop contacting me" : "Unsubscribe",
          body:
            scope === "all"
              ? `<p>${hello} confirm and we will not contact you again. Your details are removed from our outreach list.</p>`
              : `<p>${hello} confirm to stop receiving ${esc(scopeLabel(scope))} from Nexian. Your profile stays as it is.</p>`,
          action: { label: "Confirm", method: "post" },
          tone: "warn",
        }),
      );
    }

    case "set_password":
      // Handled by the SPA, which needs a password field.
      return c.redirect(`/set-password?token=${encodeURIComponent(raw)}`, 302);

    default:
      return c.html(expiredPage("Unknown link type."), 400);
  }
});

actionRoutes.post("/:token", async (c) => {
  const raw = c.req.param("token");
  const peeked = await peekActionToken(c.env.DB, raw);
  if (!peeked) return c.html(expiredPage("This link has already been used or has expired."), 410);

  const row = await consumeActionToken(c.env.DB, raw, peeked.purpose);
  if (!row) return c.html(expiredPage("This link has already been used."), 410);

  switch (row.purpose) {
    case "portal_link": {
      if (!row.contact_id) return c.html(expiredPage("This link is not linked to a profile."), 410);
      await startPortalSession(c, row.contact_id);
      return c.redirect("/profile", 303);
    }

    case "confirm_availability": {
      if (!row.contact_id) return c.html(expiredPage("This link is not linked to a profile."), 410);
      await run(
        c.env.DB,
        `UPDATE profiles SET last_confirmed_at = datetime('now') WHERE contact_id = ?`,
        row.contact_id,
      );
      await logActivity(c.env.DB, {
        contactId: row.contact_id,
        kind: "availability_confirmed",
        summary: "Confirmed availability from the reminder email",
      });
      return c.html(
        actionPage({
          title: "Thank you",
          heading: "Thanks — you're up to date",
          body: `<p>We have noted that your availability is still correct. Nothing else to do.</p>`,
          secondary: { label: "Change something anyway", href: "/join" },
          tone: "good",
        }),
      );
    }

    case "unsubscribe": {
      if (!row.contact_id) return c.html(expiredPage("This link is not linked to a profile."), 410);
      const scope = readScope(row.payload);
      if (scope === "all") {
        const target = await first<Named>(
          c.env.DB,
          `SELECT first_name, email FROM contacts WHERE id = ?`,
          row.contact_id,
        );
        // Outlives the record, so a future import cannot undo this opt-out.
        if (target) await suppressEmail(c.env.DB, target.email, "Opted out from an email");
        await run(
          c.env.DB,
          `UPDATE contacts SET suppressed = 1, suppressed_at = datetime('now'),
             suppressed_reason = 'Opted out from an email', stage = 'closed',
             updated_at = datetime('now') WHERE id = ?`,
          row.contact_id,
        );
        for (const purpose of MARKETING_PURPOSES) {
          await recordConsent(c.env, {
            contactId: row.contact_id,
            purpose,
            granted: false,
            source: "unsubscribe_link",
          });
        }
        await logActivity(c.env.DB, {
          contactId: row.contact_id,
          kind: "suppressed",
          summary: "Asked not to be contacted again (email link)",
        });
        return c.html(
          actionPage({
            title: "Done",
            heading: "You won't hear from us again",
            body: `<p>We've removed you from our outreach list. Sorry for the interruption.</p>`,
            tone: "good",
          }),
        );
      }

      await recordConsent(c.env, {
        contactId: row.contact_id,
        purpose: scope as ConsentPurpose,
        granted: false,
        source: "unsubscribe_link",
      });
      return c.html(
        actionPage({
          title: "Unsubscribed",
          heading: "Unsubscribed",
          body: `<p>You will no longer receive ${esc(scopeLabel(scope))}. Your profile and the rest of your preferences are unchanged.</p>`,
          action: { label: "Manage all my preferences", href: "/join" },
          tone: "good",
        }),
      );
    }

    default:
      return c.html(expiredPage("Unknown link type."), 400);
  }
});

type Scope = "all" | "mission_alerts" | "news";

function readScope(payload: string): Scope {
  try {
    const parsed = JSON.parse(payload) as { scope?: string };
    if (parsed.scope === "mission_alerts" || parsed.scope === "news") return parsed.scope;
  } catch {
    /* fall through to the safest option */
  }
  // An unreadable payload must not under-deliver on an opt-out: stop everything.
  return "all";
}

function scopeLabel(scope: Scope): string {
  if (scope === "mission_alerts") return "mission alerts";
  if (scope === "news") return "company news";
  return "emails";
}

function describeAvailability(
  profile: { availability: string; available_from: string | null } | null,
): string {
  if (!profile) return "available";
  if (profile.availability === "now") return "available now";
  if (profile.availability === "not_available") return "not available";
  if (profile.availability === "from_date" && profile.available_from) {
    return `available from ${profile.available_from}`;
  }
  return "available";
}
