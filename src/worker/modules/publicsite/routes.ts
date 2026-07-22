/**
 * The public surface: the registration page a freelancer reaches from our email
 * or LinkedIn message, and the "email me my link" flow for returning users.
 *
 * Nothing here requires a session, so two rules apply throughout:
 *   - never confirm whether an address is already in the database (enumeration);
 *   - never hand out a session for an address that already owns a profile.
 */
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { logActivity } from "../../lib/activity";
import { PURPOSE_LABEL, recordConsents } from "../../lib/consent";
import { resolveBaseUrl } from "../../lib/baseUrl";
import { all, first, run, uid } from "../../lib/db";
import { ALLOWED_CV_TYPES, MAX_CV_BYTES, isAcceptableCv, putCv } from "../../lib/cvStore";
import { serialiseLabels } from "../../lib/labels";
import { linkedinKey } from "../../lib/linkedinKey";
import { badRequest, tooManyRequests } from "../../lib/errors";
import { log } from "../../lib/log";
import { RATE_LIMITS, clientIp, hitRateLimit } from "../../lib/rateLimit";
import { sendEmail } from "../notifications/resend";
import { portalLinkEmail, welcomeEmail } from "../notifications/templates";
import { createActionToken } from "../notifications/tokens";

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

/**
 * Read a registration from either a JSON body or a multipart form.
 *
 * The CV travels with the registration itself. It used to be uploaded in a
 * second call authenticated by a session this endpoint handed out — which was
 * the bug described below.
 */
async function readRegistration(c: Context<AppContext>) {
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const raw = form.get("profile");
    if (typeof raw !== "string") throw badRequest("Missing registration details.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw badRequest("Could not read the registration details.");
    }
    const file = form.get("cv");
    return {
      input: registerSchema.parse(parsed),
      cv: file instanceof File && file.size > 0 ? file : null,
    };
  }
  return { input: registerSchema.parse(await c.req.json()), cv: null };
}

/**
 * Public registration.
 *
 * Two rules govern this handler, and both exist because anyone on the internet
 * can call it with anyone else's address:
 *
 *   1. It never issues a session. An earlier version signed the caller in when
 *      the address belonged to a contact with no profile yet — that is, every
 *      prospect staff had imported — which handed whoever knew that address a
 *      portal session over that person's record, internal recruiter notes
 *      included. Reaching a profile now always costs a click on a link sent to
 *      the address itself.
 *   2. Every path returns the same answer. Reporting whether the address was
 *      already known turns this form into a way to test whether a named person
 *      is in the pool.
 */
publicRoutes.post("/register", async (c) => {
  const ip = clientIp(c.req.raw.headers);
  const throttle = await hitRateLimit(c.env.DB, RATE_LIMITS.register, `ip:${ip}`);
  if (!throttle.allowed) {
    throw tooManyRequests("Too many registrations from this connection. Please try again later.");
  }

  const { input, cv } = await readRegistration(c);

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
  if (cv && !isAcceptableCv(cv.name, cv.type)) {
    throw badRequest("Please upload a PDF or Word document as your CV.");
  }
  if (cv && cv.size > MAX_CV_BYTES) {
    throw badRequest(
      `That CV is ${(cv.size / 1048576).toFixed(1)} MB. The limit is ${MAX_CV_BYTES / 1048576} MB.`,
    );
  }

  const email = input.email.trim().toLowerCase();
  const liKey = linkedinKey(input.linkedin_url);
  let existing = await first<{ id: string; suppressed: number }>(
    c.env.DB,
    `SELECT id, suppressed FROM contacts WHERE email = ?`,
    email,
  );
  // No match by email: a prospect imported from LinkedIn has no address yet, so
  // their own registration arrives looking brand new. If the LinkedIn URL they
  // typed matches an email-LESS prospect, adopt that record instead of creating
  // a twin. The guard matters: a record that already has an email is never
  // adopted, so nobody can attach themselves to someone else's identity by
  // pasting their profile URL — the worst a false claim can reach is a record
  // holding nothing but that same public URL.
  if (!existing && liKey) {
    existing = await first<{ id: string; suppressed: number }>(
      c.env.DB,
      `SELECT id, suppressed FROM contacts
       WHERE linkedin_key = ? AND email IS NULL AND anonymized_at IS NULL`,
      liKey,
    );
  }
  const hadProfile = existing
    ? Boolean(
        await first<{ contact_id: string }>(
          c.env.DB,
          `SELECT contact_id FROM profiles WHERE contact_id = ?`,
          existing.id,
        ),
      )
    : false;

  const baseUrl = await resolveBaseUrl(c.env);
  const ctx = { companyName: c.env.COMPANY_NAME, baseUrl };
  /** The one answer every branch gives, whoever is asking. */
  const answered = () => c.json({ ok: true });

  // Someone who told us never to contact them again stays that way. Acting on
  // this form would let anyone undo a stranger's opt-out, so the request is
  // accepted, recorded and ignored; coming back is a conversation with a human.
  if (existing && existing.suppressed === 1) {
    log.info("public.register_suppressed", { contact: existing.id });
    return answered();
  }

  // The address already owns a profile: change nothing, mail its owner a link.
  // The genuine returning user gets what they wanted; anyone else learns
  // nothing and alters nothing.
  if (existing && hadProfile) {
    const raw = await createActionToken(c.env.DB, {
      purpose: "portal_link",
      contactId: existing.id,
    });
    const mail = portalLinkEmail(ctx, {
      firstName: input.first_name,
      portalUrl: `${baseUrl}/a/${raw}`,
    });
    await sendEmail(c.env, {
      to: email,
      subject: mail.subject,
      html: mail.html,
      template: "portal_link",
      contactId: existing.id,
    });
    return answered();
  }

  const contactId = existing?.id ?? uid();
  if (existing) {
    // A prospect we had already added is now registering themselves.
    await run(
      c.env.DB,
      `UPDATE contacts
         SET email = ?, first_name = ?, last_name = ?, phone = COALESCE(?, phone),
             linkedin_url = COALESCE(?, linkedin_url),
             linkedin_key = COALESCE(?, linkedin_key),
             stage = CASE WHEN stage IN ('prospect', 'contacted') THEN 'registered' ELSE stage END,
             updated_at = datetime('now')
       WHERE id = ?`,
      email,
      input.first_name,
      input.last_name,
      input.phone ?? null,
      input.linkedin_url ?? null,
      liKey,
      contactId,
    );
  } else {
    await run(
      c.env.DB,
      `INSERT INTO contacts (id, email, first_name, last_name, phone, linkedin_url, linkedin_key, source, stage)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'self_signup', 'registered')`,
      contactId,
      email,
      input.first_name,
      input.last_name,
      input.phone ?? null,
      input.linkedin_url ?? null,
      liKey,
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
    serialiseLabels(input.skills),
    serialiseLabels(input.industries),
    serialiseLabels(input.languages),
    input.daily_rate ?? null,
    input.availability,
    input.available_from ?? null,
    input.location ?? null,
    input.remote_ok ? 1 : 0,
    input.freelancer_note ?? null,
  );

  if (cv) {
    const bytes = new Uint8Array(await cv.arrayBuffer());
    await putCv(c.env.DB, contactId, bytes);
    await run(
      c.env.DB,
      `UPDATE profiles SET cv_filename = ?, cv_mime = ?, cv_size = ?, cv_uploaded_at = datetime('now')
       WHERE contact_id = ?`,
      cv.name.slice(0, 200),
      ALLOWED_CV_TYPES[cv.type] ? cv.type : "application/octet-stream",
      bytes.length,
      contactId,
    );
    await logActivity(c.env.DB, {
      contactId,
      kind: "cv_uploaded",
      summary: "Uploaded a CV with their registration",
    });
  }

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

  log.info("public.registered", { contact: contactId, withCv: Boolean(cv) });
  return answered();
});

/** "Email me my update link". Always answers the same, whoever asks. */
publicRoutes.post("/request-link", async (c) => {
  const { email } = z.object({ email: z.string().email() }).parse(await c.req.json());

  // Two limits, and the per-email one is the important half: anyone can type a
  // stranger's address here, so without it this form is a way to have us mail a
  // third party on demand, as often as the attacker likes.
  const target = email.trim().toLowerCase();
  const ip = clientIp(c.req.raw.headers);
  const checks = [
    await hitRateLimit(c.env.DB, RATE_LIMITS.linkPerEmail, `email:${target}`),
    await hitRateLimit(c.env.DB, RATE_LIMITS.linkPerIp, `ip:${ip}`),
  ];
  if (checks.some((check) => !check.allowed)) {
    // Deliberately the same shape of answer as the success path: telling the
    // caller they hit a per-address limit would confirm the address exists.
    log.info("public.link_rate_limited", { ip });
    return c.json({ ok: true });
  }

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
