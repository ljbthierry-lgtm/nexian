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
import {
  cleanLanguageLevels,
  cleanMobility,
  cleanNoticePeriod,
  cleanWorkRegime,
  languagesFromLevels,
  mobilityHasRemote,
} from "../../lib/profileFields";
import { badRequest, tooManyRequests } from "../../lib/errors";
import { log } from "../../lib/log";
import { RATE_LIMITS, clientIp, hitRateLimit } from "../../lib/rateLimit";
import { unsuppressEmail, unsuppressLinkedin } from "../../lib/suppression";
import { sendEmail } from "../notifications/resend";
import { portalLinkEmail, welcomeEmail } from "../notifications/templates";
import { createActionToken, peekActionToken, revokeTokens } from "../notifications/tokens";

export const publicRoutes = new Hono<AppContext>();

const registerSchema = z.object({
  email: z.string().email().max(200),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(40).optional(),
  linkedin_url: z.string().trim().max(300).optional(),
  headline: z.string().trim().max(200).optional(),
  years_experience: z.number().int().min(0).max(70).optional(),
  years_relevant: z.number().int().min(0).max(70).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  industries: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  languages: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  language_levels: z.record(z.string(), z.string()).optional(),
  mobility: z.array(z.string()).max(10).optional(),
  work_regime: z.array(z.string()).max(4).optional(),
  notice_period: z.string().max(30).optional(),
  certifications: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
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
  /** Personalised invitation token, when they arrived through their own link. */
  invite: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
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
    certifications: rows.filter((r) => r.kind === "certification").map((r) => r.label),
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
  const levels = cleanLanguageLevels(input.language_levels);
  const mobility = cleanMobility(input.mobility);
  const workRegime = cleanWorkRegime(input.work_regime);
  const noticePeriod = cleanNoticePeriod(input.notice_period);
  // "Fully remote" is one of the mobility answers now, so remote_ok is derived
  // from it rather than a separate checkbox.
  const remoteOk = mobilityHasRemote(mobility) || input.remote_ok === true;
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
  // A personalised invitation token binds the submission to the record the
  // link was made for — that is what turns "create yourself" into "update
  // yourself". The anti-takeover rule stays primary: if the email or LinkedIn
  // they typed belongs to a DIFFERENT record, the token is ignored and the
  // anonymous-path guards apply unchanged, so a leaked link plus somebody
  // else's address still gets an attacker nothing.
  let inviteChannel: string | null = null;
  let tokenBound = false;
  if (input.invite) {
    const tokenRow = await peekActionToken(c.env.DB, input.invite);
    if (tokenRow?.purpose === "join_prefill" && tokenRow.contact_id) {
      const tokenContact = await first<{ id: string; suppressed: number }>(
        c.env.DB,
        `SELECT id, suppressed FROM contacts WHERE id = ? AND anonymized_at IS NULL`,
        tokenRow.contact_id,
      );
      if (tokenContact && (!existing || existing.id === tokenContact.id)) {
        existing = tokenContact;
        tokenBound = true;
        try {
          inviteChannel = (JSON.parse(tokenRow.payload) as { channel?: string }).channel ?? null;
        } catch {
          inviteChannel = null;
        }
      }
    }
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

  // Someone who told us never to contact them again stays that way — on the
  // anonymous path, where acting would let anyone undo a stranger's opt-out.
  // Through their OWN invitation link the calculus flips: holding the link we
  // addressed to them proves control of it, and registering is the clearest
  // possible statement that they want back in. Both identities are cleared, or
  // the next import would re-block the person who just chose to join.
  if (existing && existing.suppressed === 1) {
    if (!tokenBound) {
      log.info("public.register_suppressed", { contact: existing.id });
      return answered();
    }
    const identity = await first<{ email: string | null; linkedin_key: string | null }>(
      c.env.DB,
      `SELECT email, linkedin_key FROM contacts WHERE id = ?`,
      existing.id,
    );
    if (identity?.email) await unsuppressEmail(c.env.DB, identity.email);
    await unsuppressEmail(c.env.DB, email);
    if (identity?.linkedin_key) await unsuppressLinkedin(c.env.DB, identity.linkedin_key);
    if (liKey) await unsuppressLinkedin(c.env.DB, liKey);
    await run(
      c.env.DB,
      `UPDATE contacts SET suppressed = 0, suppressed_at = NULL, suppressed_reason = NULL,
         updated_at = datetime('now') WHERE id = ?`,
      existing.id,
    );
    await logActivity(c.env.DB, {
      contactId: existing.id,
      kind: "note",
      summary: "Suppression lifted: they registered through their own invitation link",
    });
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
    `INSERT INTO profiles (contact_id, headline, years_experience, years_relevant, skills, industries,
       languages, language_levels, mobility, work_regime, notice_period, certifications,
       daily_rate, availability, available_from, location, remote_ok, freelancer_note,
       last_confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    contactId,
    input.headline ?? "",
    input.years_experience ?? null,
    input.years_relevant ?? null,
    serialiseLabels(input.skills),
    serialiseLabels(input.industries),
    serialiseLabels(languagesFromLevels(levels, input.languages)),
    JSON.stringify(levels),
    JSON.stringify(mobility),
    JSON.stringify(workRegime),
    noticePeriod,
    serialiseLabels(input.certifications),
    input.daily_rate ?? null,
    input.availability,
    input.available_from ?? null,
    input.location ?? null,
    remoteOk ? 1 : 0,
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
    // The channel attribution the whole personalised-link exercise exists for.
    summary:
      inviteChannel === "email"
        ? "Registered through their email invitation link"
        : inviteChannel === "linkedin"
          ? "Registered through their LinkedIn invitation link"
          : "Registered through the public form",
    detail: `availability=${input.availability} rate=${input.daily_rate ?? "-"}`,
  });

  // Their invitation links have done their job; a link that kept working after
  // registration would keep exposing the pre-fill for no remaining purpose.
  await revokeTokens(c.env.DB, contactId, "join_prefill");

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

/**
 * The pre-fill behind a personalised invitation link.
 *
 * Minimisation is the design rule: the response carries exactly the fields the
 * message that delivered the link already showed — name, the address it was
 * sent to, the profile it was sent through. Never phone, never internal notes,
 * never outreach history. Links get forwarded and scanned, so anything beyond
 * that would leak more than the invitation itself did.
 */
publicRoutes.get("/join-prefill", async (c) => {
  const token = c.req.query("token") ?? "";
  const row = await peekActionToken(c.env.DB, token);
  if (!row || row.purpose !== "join_prefill" || !row.contact_id) {
    // Invalid and expired look identical: the page falls back to a blank form
    // without telling anyone whether the token ever meant something.
    return c.json({ valid: false });
  }

  const contact = await first<{
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    linkedin_url: string | null;
    has_profile: number;
  }>(
    c.env.DB,
    `SELECT ct.id, ct.first_name, ct.last_name, ct.email, ct.linkedin_url,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct WHERE ct.id = ? AND ct.anonymized_at IS NULL`,
    row.contact_id,
  );
  if (!contact) return c.json({ valid: false });

  // First open only: the reusable token keeps working, but `used_at` doubles as
  // "first opened" and writes one funnel line, not one per refresh.
  const stamped = await run(
    c.env.DB,
    `UPDATE action_tokens SET used_at = datetime('now')
     WHERE token_hash = ? AND used_at IS NULL`,
    row.token_hash,
  );
  if (stamped.meta.changes) {
    let channel: string | null = null;
    try {
      channel = (JSON.parse(row.payload) as { channel?: string }).channel ?? null;
    } catch {
      channel = null;
    }
    await logActivity(c.env.DB, {
      contactId: contact.id,
      kind: "note",
      channel,
      summary: `Opened their invitation link${channel ? ` (${channel})` : ""}`,
    });
  }

  if (contact.has_profile > 0) {
    // Already in the pool: the form would create nothing. Send them to the
    // "email me my update link" flow instead, with the address ready.
    return c.json({
      valid: true,
      alreadyRegistered: true,
      first_name: contact.first_name,
      email: contact.email,
    });
  }

  return c.json({
    valid: true,
    alreadyRegistered: false,
    prefill: {
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email,
      linkedin_url: contact.linkedin_url,
    },
  });
});
