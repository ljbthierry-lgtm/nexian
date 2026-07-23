/**
 * The surface the browser extension talks to.
 *
 * Authenticated by a personal bearer token, never a session cookie: these calls
 * come from a content script or service worker on linkedin.com, cross-site,
 * where a Lax cookie would never be sent. The token identifies one staff member,
 * so the extension can do only what that person could do in the app.
 *
 * The line this endpoint deliberately does not cross: it PREPARES a message and
 * RECORDS that a human sent one. It never sends anything on LinkedIn — no API
 * for that exists that does not violate LinkedIn's terms, and the whole point is
 * to keep the recruiter's account safe.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppContext, SessionUser } from "../../env";
import { verifyApiToken } from "../../lib/apiToken";
import { logActivity } from "../../lib/activity";
import { resolveBaseUrl } from "../../lib/baseUrl";
import { first, run } from "../../lib/db";
import { unauthorized } from "../../lib/errors";
import { linkedinKey } from "../../lib/linkedinKey";
import { decideOutreach } from "../outreach/eligibility";
import { connectionNote, directMessage } from "../outreach/linkedin";
import { policyOf } from "../outreach/send";
import { createActionToken } from "../notifications/tokens";

export const extRoutes = new Hono<AppContext>();

/** Permit the cross-origin preflight; auth is the bearer token, so the origin is open. */
extRoutes.options("/*", (c) =>
  c.body(null, 204, {
    "Access-Control-Allow-Origin": c.req.header("origin") ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  }),
);

/** Bearer-token gate for everything below. */
extRoutes.use("*", async (c, next) => {
  // The preflight carries no Authorization header by design; let it reach the
  // OPTIONS handler above instead of being rejected here.
  if (c.req.method === "OPTIONS") return next();
  const user = await verifyApiToken(c.env.DB, c.req.header("authorization"));
  if (!user) throw unauthorized("Invalid or revoked API token");
  c.set("user", user);
  await next();
  // Let the extension read the response from any origin (token, not cookie, is auth).
  c.header("Access-Control-Allow-Origin", c.req.header("origin") ?? "*");
});

/** A tiny call the extension's options page uses to confirm the token works. */
extRoutes.get("/whoami", (c) => {
  const user = c.get("user") as SessionUser;
  return c.json({ ok: true, name: user.name, email: user.email });
});

interface ContactRow {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  source: string;
  suppressed: number;
  anonymized_at: string | null;
  outreach_count: number;
  last_outreach_at: string | null;
  linkedin_url: string | null;
  has_profile: number;
  replied_at: string | null;
}

/**
 * Given the LinkedIn profile URL the recruiter is looking at, return the
 * prepared message for that person — and whether they should be contacted at all.
 */
extRoutes.get("/lookup", async (c) => {
  const url = c.req.query("url") ?? "";
  const key = linkedinKey(url);
  if (!key) return c.json({ found: false, reason: "not_a_profile" });

  const row = await first<ContactRow>(
    c.env.DB,
    `SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.source, ct.suppressed,
            ct.anonymized_at, ct.outreach_count, ct.last_outreach_at, ct.linkedin_url,
            ct.replied_at,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct WHERE ct.linkedin_key = ? AND ct.anonymized_at IS NULL`,
    key,
  );
  if (!row) return c.json({ found: false, reason: "not_in_pool" });

  const user = c.get("user") as SessionUser;
  const name = `${row.first_name} ${row.last_name}`.trim();

  if (row.has_profile > 0) {
    return c.json({
      found: true,
      alreadyRegistered: true,
      contact: { id: row.id, name },
    });
  }
  if (row.suppressed) {
    return c.json({
      found: true,
      blocked: true,
      reason: "This person asked not to be contacted.",
      contact: { id: row.id, name },
    });
  }

  const decision = decideOutreach(
    {
      suppressed: false,
      anonymized: false,
      hasProfile: false,
      outreachCount: row.outreach_count,
      lastOutreachAt: row.last_outreach_at,
      replied: row.replied_at !== null,
    },
    policyOf(c.env),
  );

  const baseUrl = await resolveBaseUrl(c.env);
  const inviteToken = await createActionToken(c.env.DB, {
    purpose: "join_prefill",
    contactId: row.id,
    payload: { channel: "linkedin" },
  });
  const input = {
    firstName: row.first_name,
    companyName: c.env.COMPANY_NAME,
    senderName: user.name,
    registerUrl: `${baseUrl}/join?invite=${inviteToken}`,
    focus: c.req.query("focus") ?? undefined,
  };

  return c.json({
    found: true,
    contact: { id: row.id, name, linkedin_url: row.linkedin_url },
    decision,
    connectionNote: connectionNote(input),
    message: directMessage(input),
  });
});

/**
 * Record that the recruiter has now sent the LinkedIn message by hand. Counts as
 * one outreach touch, shared with the email budget, exactly as the in-app button
 * does — so the two channels can never gang up on one person.
 */
extRoutes.post("/sent", async (c) => {
  const { contactId } = z.object({ contactId: z.string().min(1) }).parse(await c.req.json());
  const user = c.get("user") as SessionUser;

  const exists = await first<{ id: string }>(
    c.env.DB,
    `SELECT id FROM contacts WHERE id = ? AND anonymized_at IS NULL`,
    contactId,
  );
  if (!exists) return c.json({ ok: false, error: "not_found" }, 404);

  await run(
    c.env.DB,
    `UPDATE contacts
       SET linkedin_state = 'sent', linkedin_sent_at = datetime('now'),
           outreach_count = outreach_count + 1,
           first_outreach_at = COALESCE(first_outreach_at, datetime('now')),
           last_outreach_at = datetime('now'),
           stage = CASE WHEN stage = 'prospect' THEN 'contacted' ELSE stage END,
           updated_at = datetime('now')
     WHERE id = ?`,
    contactId,
  );
  await logActivity(c.env.DB, {
    contactId,
    kind: "linkedin_sent",
    channel: "linkedin",
    summary: "LinkedIn message sent by hand (browser extension)",
    actorUserId: user.id,
  });
  return c.json({ ok: true });
});
