/**
 * The public surface: the registration page a freelancer reaches from our email
 * or LinkedIn message, and the "email me my link" flow for returning users.
 *
 * Nothing here requires a session, so two rules apply throughout:
 *   - never confirm whether an address is already in the database (enumeration);
 *   - never hand out a session for an address that already owns a profile.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { logActivity } from "../../lib/activity";
import { PURPOSE_LABEL, recordConsents } from "../../lib/consent";
import { resolveBaseUrl } from "../../lib/baseUrl";
import { all, first, run, uid } from "../../lib/db";
import { badRequest } from "../../lib/errors";
import { log } from "../../lib/log";
import { unsuppressEmail } from "../../lib/suppression";
import { sendEmail } from "../notifications/resend";
import { portalLinkEmail, welcomeEmail } from "../notifications/templates";
import { createActionToken } from "../notifications/tokens";
import { startPortalSession } from "../portal/session";

export const publicRoutes = new Hono<AppContext>();

const registerSchema = z.object({
  email: z.string().email().max(200),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(40).optional(),
  linkedin_url: z.string().trim().max(300).optional(),
  headline: z.string().trim().max(200).optional(),
  years_experience: z.number().int().min(0).max(70).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  industries: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  languages: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  daily_rate: z.number().int().min(0).max(10000).optional(),
  availability: z.enum(["now", "from_date", "not_available"]),
  available_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  location: z.string().trim().max(120).optional(),
  remote_ok: z.boolean().default(false),
  freelancer_note: z.string().trim().max(2000).optional(),
  consent_data_processing: z.boolean(),
  consent_mission_alerts: z.boolean().default(false),
  consent_news: z.boolean().default(false),
});

/** Skills, industries and languages that drive the form's pickers. */
publicRoutes.get("/taxonomy", async (c) => {
  const rows = await all<{ kind: string; label: string }>(
    c.env.DB,
    `SELECT kind, label FROM taxonomy WHERE active = 1 ORDER BY sort, label`,
  );
  return c.json({
    skills: rows.filter((r) => r.kind === "skill").map((r) => r.label),
    industries: rows.filter((r) => r.kind === "industry").map((r) => r.label),
    languages: rows.filter((r) => r.kind === "language").map((r) => r.label),
    policyVersion: c.env.PRIVACY_POLICY_VERSION,
    companyName: c.env.COMPANY_NAME,
  });
});

publicRoutes.post("/register", async (c) => {
  const input = registerSchema.parse(await c.req.json());

  // The processing consent is the legal basis for holding the profile at all.
  if (!input.consent_data_processing) {
    throw badRequest(
      "We can only store your profile if you agree to the first checkbox.",
      "consent_required",
    );
  }
  if (input.availability === "from_date" && !input.available_from) {
    throw badRequest("Please give the date you become available.", "date_required");
  }

  const email = input.email.trim().toLowerCase();
  const existing = await first<{ id: string; suppressed: number; stage: string }>(
    c.env.DB,
    `SELECT id, suppressed, stage FROM contacts WHERE email = ?`,
    email,
  );
  const hadProfile = existing
    ? Boolean(
        await first<{ contact_id: string }>(
          c.env.DB,
          `SELECT contact_id FROM profiles WHERE contact_id = ?`,
          existing.id,
        ),
      )
    : false;

  const contactId = existing?.id ?? uid();
  const baseUrl = await resolveBaseUrl(c.env);
  const ctx = { companyName: c.env.COMPANY_NAME, baseUrl };

  // Someone re-submitting the form for an address that already has a profile is
  // either the owner returning, or someone else guessing. Either way: change
  // nothing, and mail the real owner a link. That keeps takeover impossible
  // while still doing the useful thing for the genuine case.
  if (hadProfile) {
    const raw = await createActionToken(c.env.DB, { purpose: "portal_link", contactId });
    const mail = portalLinkEmail(ctx, {
      firstName: input.first_name,
      portalUrl: `${baseUrl}/a/${raw}`,
    });
    await sendEmail(c.env, {
      to: email,
      subject: mail.subject,
      html: mail.html,
      template: "portal_link",
      contactId,
    });
    return c.json({ ok: true, existing: true });
  }

  if (existing) {
    // A prospect we had already added is now registering themselves.
    await run(
      c.env.DB,
      `UPDATE contacts
         SET first_name = ?, last_name = ?, phone = COALESCE(?, phone),
             linkedin_url = COALESCE(?, linkedin_url),
             stage = CASE WHEN stage IN ('prospect', 'contacted') THEN 'registered' ELSE stage END,
             suppressed = 0, suppressed_at = NULL, suppressed_reason = NULL,
             updated_at = datetime('now')
       WHERE id = ?`,
      input.first_name,
      input.last_name,
      input.phone ?? null,
      input.linkedin_url ?? null,
      contactId,
    );
    if (existing.suppressed === 1) {
      // Registering voluntarily overrides an earlier "do not contact" — including
      // the permanent hashed list, or they would be blocked from their own pool.
      await unsuppressEmail(c.env.DB, email);
      await logActivity(c.env.DB, {
        contactId,
        kind: "note",
        summary: "Suppression lifted: the freelancer registered themselves",
      });
    }
  } else {
    await run(
      c.env.DB,
      `INSERT INTO contacts (id, email, first_name, last_name, phone, linkedin_url, source, stage)
       VALUES (?, ?, ?, ?, ?, ?, 'self_signup', 'registered')`,
      contactId,
      email,
      input.first_name,
      input.last_name,
      input.phone ?? null,
      input.linkedin_url ?? null,
    );
  }

  await run(
    c.env.DB,
    `INSERT INTO profiles (contact_id, headline, years_experience, skills, industries, languages,
       daily_rate, availability, available_from, location, remote_ok, freelancer_note,
       last_confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    contactId,
    input.headline ?? "",
    input.years_experience ?? null,
    JSON.stringify(input.skills),
    JSON.stringify(input.industries),
    JSON.stringify(input.languages),
    input.daily_rate ?? null,
    input.availability,
    input.available_from ?? null,
    input.location ?? null,
    input.remote_ok ? 1 : 0,
    input.freelancer_note ?? null,
  );

  await recordConsents(
    c.env,
    contactId,
    {
      data_processing: true,
      mission_alerts: input.consent_mission_alerts,
      news: input.consent_news,
    },
    {
      source: "registration_form",
      ip: c.req.header("cf-connecting-ip") ?? null,
      userAgent: (c.req.header("user-agent") ?? "").slice(0, 300),
    },
  );

  await logActivity(c.env.DB, {
    contactId,
    kind: "registered",
    summary: "Registered through the public form",
    detail: `availability=${input.availability} rate=${input.daily_rate ?? "-"}`,
  });

  const consentSummary = [PURPOSE_LABEL.data_processing];
  if (input.consent_mission_alerts) consentSummary.push(PURPOSE_LABEL.mission_alerts);
  if (input.consent_news) consentSummary.push(PURPOSE_LABEL.news);

  const raw = await createActionToken(c.env.DB, { purpose: "portal_link", contactId });
  const mail = welcomeEmail(ctx, {
    firstName: input.first_name,
    portalUrl: `${baseUrl}/a/${raw}`,
    consentSummary,
  });
  await sendEmail(c.env, {
    to: email,
    subject: mail.subject,
    html: mail.html,
    template: "welcome",
    contactId,
  });

  // First-time registration: sign them straight in so the CV upload and any
  // corrections happen in the same sitting.
  await startPortalSession(c, contactId);
  log.info("public.registered", { contact: contactId });
  return c.json({ ok: true, existing: false });
});

/** "Email me my update link". Always answers the same, whoever asks. */
publicRoutes.post("/request-link", async (c) => {
  const { email } = z.object({ email: z.string().email() }).parse(await c.req.json());
  const contact = await first<{ id: string; first_name: string }>(
    c.env.DB,
    `SELECT ct.id, ct.first_name FROM contacts ct
     JOIN profiles p ON p.contact_id = ct.id
     WHERE ct.email = ? AND ct.anonymized_at IS NULL`,
    email.trim().toLowerCase(),
  );
  if (contact) {
    const baseUrl = await resolveBaseUrl(c.env);
    const raw = await createActionToken(c.env.DB, {
      purpose: "portal_link",
      contactId: contact.id,
    });
    const mail = portalLinkEmail(
      { companyName: c.env.COMPANY_NAME, baseUrl },
      { firstName: contact.first_name, portalUrl: `${baseUrl}/a/${raw}` },
    );
    await sendEmail(c.env, {
      to: email.trim().toLowerCase(),
      subject: mail.subject,
      html: mail.html,
      template: "portal_link",
      contactId: contact.id,
    });
  }
  return c.json({ ok: true });
});
