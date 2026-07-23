/**
 * The freelancer's own view of their record: read, change, download, delete.
 *
 * Everything here is scoped to the contact in the portal session — never to an
 * id from the request — so one signed-in freelancer can never address another's
 * profile. These endpoints are also how the GDPR rights of access, rectification,
 * portability and erasure are actually exercised.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppContext, ConsentPurpose } from "../../env";
import { logActivity } from "../../lib/activity";
import { consentHistory, currentConsents, recordConsent } from "../../lib/consent";
import {
  ALLOWED_CV_TYPES,
  MAX_CV_BYTES,
  cvResponse,
  deleteCv,
  getCv,
  isAcceptableCv,
  putCv,
} from "../../lib/cvStore";
import { all, first, run } from "../../lib/db";
import { parseLabels, serialiseLabels } from "../../lib/labels";
import { badRequest, notFound } from "../../lib/errors";
import { suppressContact } from "../../lib/suppress";
import {
  cleanLanguageLevels,
  cleanMobility,
  cleanNoticePeriod,
  cleanWorkRegime,
  languagesFromLevels,
  mobilityHasRemote,
} from "../../lib/profileFields";
import { requirePortal } from "../../middleware/auth";

/** D1 gives back a string; a corrupt value must not throw the whole load. */
function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
import { revokeTokens } from "../notifications/tokens";
import { endPortalSession, revokePortalSessions } from "./session";

export const portalRoutes = new Hono<AppContext>();
portalRoutes.use("*", requirePortal());

interface ProfileRow {
  headline: string;
  years_experience: number | null;
  years_relevant: number | null;
  skills: string;
  industries: string;
  languages: string;
  language_levels: string;
  mobility: string;
  work_regime: string;
  notice_period: string | null;
  certifications: string;
  daily_rate: number | null;
  currency: string;
  availability: string;
  available_from: string | null;
  location: string | null;
  remote_ok: number;
  freelancer_note: string | null;
  cv_filename: string | null;
  cv_size: number | null;
  cv_uploaded_at: string | null;
  registered_at: string;
  updated_at: string;
  last_confirmed_at: string | null;
}

async function loadProfile(db: D1Database, contactId: string) {
  const row = await first<ProfileRow>(
    db,
    `SELECT headline, years_experience, years_relevant, skills, industries, languages,
            language_levels, mobility, work_regime, notice_period, certifications, daily_rate, currency,
            availability, available_from, location, remote_ok, freelancer_note,
            cv_filename, cv_size, cv_uploaded_at, registered_at, updated_at, last_confirmed_at
     FROM profiles WHERE contact_id = ?`,
    contactId,
  );
  if (!row) throw notFound("We could not find your profile");
  return {
    ...row,
    skills: parseLabels(row.skills),
    industries: parseLabels(row.industries),
    languages: parseLabels(row.languages),
    language_levels: cleanLanguageLevels(safeJson(row.language_levels)),
    mobility: cleanMobility(safeJson(row.mobility)),
    work_regime: cleanWorkRegime(safeJson(row.work_regime)),
    notice_period: row.notice_period,
    certifications: parseLabels(row.certifications),
    remote_ok: row.remote_ok === 1,
  };
}

portalRoutes.get("/me", async (c) => {
  const contact = c.get("contact");
  const profile = await loadProfile(c.env.DB, contact.id);
  const consents = await currentConsents(c.env.DB, contact.id);
  return c.json({ contact, profile, consents });
});

const profileSchema = z.object({
  first_name: z.string().trim().min(1).max(80).optional(),
  last_name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  linkedin_url: z.string().trim().max(300).nullable().optional(),
  headline: z.string().trim().max(200).optional(),
  years_experience: z.number().int().min(0).max(70).nullable().optional(),
  years_relevant: z.number().int().min(0).max(70).nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  industries: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  languages: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  language_levels: z.record(z.string(), z.string()).optional(),
  mobility: z.array(z.string()).max(10).optional(),
  work_regime: z.array(z.string()).max(4).optional(),
  notice_period: z.string().max(30).nullable().optional(),
  certifications: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  daily_rate: z.number().int().min(0).max(10000).nullable().optional(),
  availability: z.enum(["now", "from_date", "not_available"]).optional(),
  available_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  location: z.string().trim().max(120).nullable().optional(),
  remote_ok: z.boolean().optional(),
  freelancer_note: z.string().trim().max(2000).nullable().optional(),
});

portalRoutes.patch("/profile", async (c) => {
  const contact = c.get("contact");
  const input = profileSchema.parse(await c.req.json());

  if (input.availability === "from_date" && input.available_from === null) {
    throw badRequest("Please give the date you become available.");
  }

  const nameUpdates: string[] = [];
  const nameParams: unknown[] = [];
  if (input.first_name !== undefined) {
    nameUpdates.push("first_name = ?");
    nameParams.push(input.first_name);
  }
  if (input.last_name !== undefined) {
    nameUpdates.push("last_name = ?");
    nameParams.push(input.last_name);
  }
  if (input.phone !== undefined) {
    nameUpdates.push("phone = ?");
    nameParams.push(input.phone);
  }
  if (input.linkedin_url !== undefined) {
    nameUpdates.push("linkedin_url = ?");
    nameParams.push(input.linkedin_url);
  }
  if (nameUpdates.length) {
    await run(
      c.env.DB,
      `UPDATE contacts SET ${nameUpdates.join(", ")}, updated_at = datetime('now') WHERE id = ?`,
      ...nameParams,
      contact.id,
    );
  }

  const fields: string[] = [];
  const params: unknown[] = [];
  const set = (column: string, value: unknown) => {
    fields.push(`${column} = ?`);
    params.push(value);
  };
  if (input.headline !== undefined) set("headline", input.headline);
  if (input.years_experience !== undefined) set("years_experience", input.years_experience);
  if (input.years_relevant !== undefined) set("years_relevant", input.years_relevant);
  if (input.skills !== undefined) set("skills", serialiseLabels(input.skills));
  if (input.industries !== undefined) set("industries", serialiseLabels(input.industries));
  if (input.language_levels !== undefined) {
    const levels = cleanLanguageLevels(input.language_levels);
    set("language_levels", JSON.stringify(levels));
    // Keep the flat list in step with the grades — it is what the pool filters.
    set("languages", serialiseLabels(languagesFromLevels(levels, input.languages ?? [])));
  } else if (input.languages !== undefined) {
    set("languages", serialiseLabels(input.languages));
  }
  if (input.mobility !== undefined) {
    const mob = cleanMobility(input.mobility);
    set("mobility", JSON.stringify(mob));
    // Fully-remote lives in mobility, so keep remote_ok in step with it.
    set("remote_ok", mobilityHasRemote(mob) ? 1 : 0);
  }
  if (input.work_regime !== undefined) {
    set("work_regime", JSON.stringify(cleanWorkRegime(input.work_regime)));
  }
  if (input.notice_period !== undefined)
    set("notice_period", cleanNoticePeriod(input.notice_period));
  if (input.certifications !== undefined)
    set("certifications", serialiseLabels(input.certifications));
  if (input.daily_rate !== undefined) set("daily_rate", input.daily_rate);
  if (input.availability !== undefined) set("availability", input.availability);
  if (input.available_from !== undefined) set("available_from", input.available_from);
  if (input.location !== undefined) set("location", input.location);
  if (input.remote_ok !== undefined) set("remote_ok", input.remote_ok ? 1 : 0);
  if (input.freelancer_note !== undefined) set("freelancer_note", input.freelancer_note);

  if (fields.length) {
    // Any edit is also a fresh statement that the availability is current, so the
    // reminder clock restarts and the pool does not show the profile as stale.
    await run(
      c.env.DB,
      `UPDATE profiles SET ${fields.join(", ")}, updated_at = datetime('now'),
         last_confirmed_at = datetime('now') WHERE contact_id = ?`,
      ...params,
      contact.id,
    );
  }

  await logActivity(c.env.DB, {
    contactId: contact.id,
    kind: "profile_updated",
    summary: "Updated their own profile",
    detail: Object.keys(input).join(", "),
  });
  return c.json({ ok: true, profile: await loadProfile(c.env.DB, contact.id) });
});

/** The one-tap "I'm available now" / "still correct" action inside the portal. */
portalRoutes.post("/confirm-availability", async (c) => {
  const contact = c.get("contact");
  const { availability, available_from } = z
    .object({
      availability: z.enum(["now", "from_date", "not_available"]).optional(),
      available_from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
    })
    .parse(await c.req.json().catch(() => ({})));

  if (availability) {
    await run(
      c.env.DB,
      `UPDATE profiles SET availability = ?, available_from = ?, updated_at = datetime('now'),
         last_confirmed_at = datetime('now') WHERE contact_id = ?`,
      availability,
      availability === "from_date" ? (available_from ?? null) : null,
      contact.id,
    );
  } else {
    await run(
      c.env.DB,
      `UPDATE profiles SET last_confirmed_at = datetime('now') WHERE contact_id = ?`,
      contact.id,
    );
  }
  await logActivity(c.env.DB, {
    contactId: contact.id,
    kind: "availability_confirmed",
    summary: availability
      ? `Set availability to ${availability}`
      : "Confirmed availability is current",
  });
  return c.json({ ok: true });
});

portalRoutes.post("/cv", async (c) => {
  const contact = c.get("contact");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("No file was uploaded.");
  if (file.size === 0) throw badRequest("That file is empty.");
  if (file.size > MAX_CV_BYTES) {
    throw badRequest(
      `That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_CV_BYTES / 1048576} MB.`,
    );
  }
  if (!isAcceptableCv(file.name, file.type)) {
    throw badRequest("Please upload a PDF or Word document.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  await putCv(c.env.DB, contact.id, bytes);
  const mime = ALLOWED_CV_TYPES[file.type] ? file.type : "application/octet-stream";
  await run(
    c.env.DB,
    `UPDATE profiles SET cv_filename = ?, cv_mime = ?, cv_size = ?, cv_uploaded_at = datetime('now'),
       updated_at = datetime('now') WHERE contact_id = ?`,
    file.name.slice(0, 200),
    mime,
    bytes.length,
    contact.id,
  );
  await logActivity(c.env.DB, {
    contactId: contact.id,
    kind: "cv_uploaded",
    summary: `Uploaded a CV (${file.name.slice(0, 100)})`,
  });
  return c.json({ ok: true, filename: file.name, size: bytes.length });
});

portalRoutes.get("/cv", async (c) => {
  const contact = c.get("contact");
  const meta = await first<{ cv_filename: string | null; cv_mime: string | null }>(
    c.env.DB,
    `SELECT cv_filename, cv_mime FROM profiles WHERE contact_id = ?`,
    contact.id,
  );
  const bytes = await getCv(c.env.DB, contact.id);
  if (!bytes || !meta?.cv_filename) throw notFound("No CV on file");
  return cvResponse(bytes, meta.cv_filename, meta.cv_mime);
});

portalRoutes.delete("/cv", async (c) => {
  const contact = c.get("contact");
  await deleteCv(c.env.DB, contact.id);
  await run(
    c.env.DB,
    `UPDATE profiles SET cv_filename = NULL, cv_mime = NULL, cv_size = NULL, cv_uploaded_at = NULL,
       updated_at = datetime('now') WHERE contact_id = ?`,
    contact.id,
  );
  await logActivity(c.env.DB, { contactId: contact.id, kind: "note", summary: "Removed their CV" });
  return c.json({ ok: true });
});

/** Change one marketing preference. Withdrawal is as easy as granting. */
portalRoutes.post("/consent", async (c) => {
  const contact = c.get("contact");
  const { purpose, granted } = z
    .object({
      purpose: z.enum(["mission_alerts", "news"]),
      granted: z.boolean(),
    })
    .parse(await c.req.json());

  await recordConsent(c.env, {
    contactId: contact.id,
    purpose: purpose as ConsentPurpose,
    granted,
    source: "profile_page",
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: (c.req.header("user-agent") ?? "").slice(0, 300),
  });
  return c.json({ ok: true, consents: await currentConsents(c.env.DB, contact.id) });
});

/** Right of access and portability: everything we hold, as JSON. */
portalRoutes.get("/export", async (c) => {
  const contact = c.get("contact");
  const [full, profile, consents, activity] = await Promise.all([
    first<Record<string, unknown>>(
      c.env.DB,
      // Explicit columns, never SELECT *: internal_notes is staff commentary and
      // a future column must not publish itself into this download by default.
      `SELECT id, email, first_name, last_name, phone, linkedin_url, source, stage,
              outreach_count, first_outreach_at, last_outreach_at, created_at
       FROM contacts WHERE id = ?`,
      contact.id,
    ),
    loadProfile(c.env.DB, contact.id),
    consentHistory(c.env.DB, contact.id),
    all<Record<string, unknown>>(
      c.env.DB,
      // Staff-authored notes are excluded: the "note" kind is where a recruiter's
      // private commentary is stored, and a self-service download is not the
      // place to hand it over. A formal access request still covers it.
      `SELECT kind, summary, detail, created_at FROM activity
       WHERE contact_id = ? AND kind != 'note' ORDER BY created_at`,
      contact.id,
    ),
  ]);
  await logActivity(c.env.DB, {
    contactId: contact.id,
    kind: "exported",
    summary: "Downloaded their own data",
  });
  const payload = {
    exported_at: new Date().toISOString(),
    contact: full,
    profile,
    consents,
    activity,
    note: "Your CV is a separate download from your profile page.",
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="nexian-my-data.json"`,
    },
  });
});

/**
 * Right to erasure. The profile, CV and personal fields go immediately; the
 * contact row survives as an anonymised tombstone carrying the consent and
 * activity history, which is what proves we were allowed to hold the data and
 * that the deletion happened.
 */
portalRoutes.post("/delete", async (c) => {
  const contact = c.get("contact");
  // Recorded before the address is overwritten below, or a later import of the
  // same list would quietly bring this person back.
  await suppressContact(c.env, {
    contactId: contact.id,
    reason: "Profile deleted by the freelancer",
    source: "profile_page",
  });
  await deleteCv(c.env.DB, contact.id);
  await run(c.env.DB, `DELETE FROM profiles WHERE contact_id = ?`, contact.id);
  await run(
    c.env.DB,
    `UPDATE contacts
       SET first_name = '', last_name = '', phone = NULL, linkedin_url = NULL,
           email = 'deleted+' || id || '@invalid', internal_notes = NULL,
           stage = 'closed', suppressed = 1, suppressed_at = datetime('now'),
           suppressed_reason = 'Deleted by the freelancer',
           anonymized_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    contact.id,
  );
  await revokeTokens(c.env.DB, contact.id);
  await revokePortalSessions(c.env.DB, contact.id);
  await logActivity(c.env.DB, {
    contactId: contact.id,
    kind: "deleted",
    summary: "Profile deleted at the freelancer's request",
  });
  endPortalSession(c);
  return c.json({ ok: true });
});

portalRoutes.post("/logout", (c) => {
  endPortalSession(c);
  return c.json({ ok: true });
});
