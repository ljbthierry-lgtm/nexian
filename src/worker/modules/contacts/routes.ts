/** Back-office contact management: the pipeline from cold prospect to pool member. */
import { Hono } from "hono";
import { z } from "zod";
import type { AppContext, Stage } from "../../env";
import { recordAccess } from "../../lib/accessLog";
import { alertOnExport } from "../admin/exportAlert";
import { logActivity } from "../../lib/activity";
import { consentHistory, consentsFor, currentConsents } from "../../lib/consent";
import { mapImportRows, parseCsv, toCsv } from "../../lib/csv";
import { cvResponse, getCv } from "../../lib/cvStore";
import { all, first, run, selectByChunks, uid } from "../../lib/db";
import { parseLabels } from "../../lib/labels";
import { badRequest, notFound } from "../../lib/errors";
import { clientIp } from "../../lib/rateLimit";
import { deriveInviteStatus } from "../../lib/inviteStatus";
import { linkedinKey } from "../../lib/linkedinKey";
import { suppressContact } from "../../lib/suppress";
import {
  emailHash,
  filterSuppressedHashes,
  isSuppressed,
  linkedinHash,
} from "../../lib/suppression";
import { requireAuth } from "../../middleware/auth";

export const contactRoutes = new Hono<AppContext>();
contactRoutes.use("*", requireAuth());

const STAGES: Stage[] = ["prospect", "contacted", "registered", "vetted", "on_mission", "closed"];

interface ContactRow {
  id: string;
  email: string | null;
  linkedin_key: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  linkedin_url: string | null;
  source: string;
  source_note: string | null;
  stage: Stage;
  suppressed: number;
  suppressed_reason: string | null;
  outreach_count: number;
  last_outreach_at: string | null;
  linkedin_state: string;
  anonymized_at: string | null;
  created_at: string;
  has_profile: number;
  email_status: string;
  replied_at: string | null;
  reply_outcome: string | null;
}

/** List with the filters the Contacts screen offers. */
contactRoutes.get("/", async (c) => {
  const q = c.req.query();
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.stage && STAGES.includes(q.stage as Stage)) {
    where.push("ct.stage = ?");
    params.push(q.stage);
  }
  if (q.suppressed === "1") where.push("ct.suppressed = 1");
  if (q.suppressed === "0") where.push("ct.suppressed = 0");
  if (q.channel === "linkedin") where.push("ct.linkedin_url IS NOT NULL AND ct.linkedin_url != ''");
  if (q.channel === "queued") where.push("ct.linkedin_state = 'queued'");
  if (q.contactable === "1") {
    where.push("ct.suppressed = 0 AND ct.anonymized_at IS NULL");
  }
  const search = (q.search ?? "").trim();
  if (search) {
    where.push("(ct.first_name LIKE ? OR ct.last_name LIKE ? OR ct.email LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const limit = Math.min(Number.parseInt(q.limit ?? "100", 10) || 100, 500);
  const offset = Math.max(Number.parseInt(q.offset ?? "0", 10) || 0, 0);

  const rows = await all<ContactRow>(
    c.env.DB,
    `SELECT ct.id, ct.email, ct.linkedin_key, ct.first_name, ct.last_name, ct.phone, ct.linkedin_url, ct.source,
            ct.source_note, ct.stage, ct.suppressed, ct.suppressed_reason, ct.outreach_count,
            ct.last_outreach_at, ct.linkedin_state, ct.anonymized_at, ct.created_at,
            ct.email_status, ct.replied_at, ct.reply_outcome,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ct.updated_at DESC
     LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );

  const consents = await consentsFor(
    c.env.DB,
    rows.map((r) => r.id),
  );
  const total = await first<{ n: number }>(
    c.env.DB,
    `SELECT COUNT(*) AS n FROM contacts ct ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    ...params,
  );

  return c.json({
    total: total?.n ?? rows.length,
    contacts: rows.map((r) => ({
      ...r,
      suppressed: r.suppressed === 1,
      has_profile: r.has_profile > 0,
      consents: consents.get(r.id),
      // Derived here, once, so every screen shows the same funnel position.
      invite_status: deriveInviteStatus({
        hasEmail: r.email !== null,
        hasLinkedin: r.linkedin_key !== null || Boolean(r.linkedin_url),
        hasProfile: r.has_profile > 0,
        suppressed: r.suppressed === 1,
        anonymized: r.anonymized_at !== null,
        outreachCount: r.outreach_count,
        linkedinState: r.linkedin_state as "none" | "queued" | "sent",
        replied: r.replied_at !== null,
        replyOutcome: r.reply_outcome as "interested" | null,
        emailUndeliverable: r.email_status === "bounced" || r.email_status === "complained",
      }),
    })),
  });
});

/** Counts behind the four cards on the Contacts screen. */
contactRoutes.get("/stats", async (c) => {
  const row = await first<{
    prospects: number;
    contacted: number;
    registered: number;
    suppressed: number;
    linkedin_queue: number;
  }>(
    c.env.DB,
    `SELECT
       SUM(CASE WHEN stage = 'prospect' AND suppressed = 0 THEN 1 ELSE 0 END) AS prospects,
       SUM(CASE WHEN stage = 'contacted' AND suppressed = 0 THEN 1 ELSE 0 END) AS contacted,
       SUM(CASE WHEN stage IN ('registered','vetted','on_mission') THEN 1 ELSE 0 END) AS registered,
       SUM(CASE WHEN suppressed = 1 THEN 1 ELSE 0 END) AS suppressed,
       SUM(CASE WHEN linkedin_state = 'queued' THEN 1 ELSE 0 END) AS linkedin_queue
     FROM contacts`,
  );
  return c.json({
    prospects: row?.prospects ?? 0,
    contacted: row?.contacted ?? 0,
    registered: row?.registered ?? 0,
    suppressed: row?.suppressed ?? 0,
    linkedinQueue: row?.linkedin_queue ?? 0,
  });
});

const createSchema = z.object({
  email: z.string().email().optional(),
  first_name: z.string().trim().max(80).default(""),
  last_name: z.string().trim().max(80).default(""),
  phone: z.string().trim().max(40).optional(),
  linkedin_url: z.string().trim().max(300).optional(),
  source: z.enum(["manual", "import", "linkedin", "referral", "event"]).default("manual"),
  source_note: z.string().trim().max(300).optional(),
});

contactRoutes.post("/", async (c) => {
  const input = createSchema.parse(await c.req.json());
  const email = input.email?.trim().toLowerCase();
  const liKey = linkedinKey(input.linkedin_url);
  if (!email && !liKey) {
    throw badRequest(
      "A contact needs an email address or a LinkedIn profile URL — otherwise nobody can ever reach them.",
      "no_channel",
    );
  }

  if (email) {
    const existing = await first<{ id: string }>(
      c.env.DB,
      `SELECT id FROM contacts WHERE email = ?`,
      email,
    );
    if (existing) throw badRequest("That email address is already in the list.", "duplicate");
  }
  if (liKey) {
    const existing = await first<{ id: string }>(
      c.env.DB,
      `SELECT id FROM contacts WHERE linkedin_key = ?`,
      liKey,
    );
    if (existing) throw badRequest("That LinkedIn profile is already in the list.", "duplicate");
  }

  const optedOut =
    (email && (await isSuppressed(c.env.DB, email))) ||
    (liKey && (await filterSuppressedHashes(c.env.DB, [await linkedinHash(liKey)])).size > 0);
  if (optedOut) {
    throw badRequest(
      "This person has asked never to be contacted again. They can only come back by registering themselves.",
      "suppressed",
    );
  }

  const id = uid();
  await run(
    c.env.DB,
    `INSERT INTO contacts (id, email, first_name, last_name, phone, linkedin_url, linkedin_key, source, source_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    email ?? null,
    input.first_name,
    input.last_name,
    input.phone ?? null,
    input.linkedin_url ?? null,
    liKey,
    input.source,
    input.source_note ?? null,
  );
  await logActivity(c.env.DB, {
    contactId: id,
    kind: "created",
    summary: `Added as a prospect (${input.source})`,
    actorUserId: c.get("user").id,
  });
  return c.json({ ok: true, id });
});

contactRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const contact = await first<ContactRow & { internal_notes: string | null }>(
    c.env.DB,
    `SELECT ct.*, (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct WHERE ct.id = ?`,
    id,
  );
  if (!contact) throw notFound("No such contact");

  const [profile, consents, history, activity] = await Promise.all([
    first<Record<string, unknown>>(c.env.DB, `SELECT * FROM profiles WHERE contact_id = ?`, id),
    currentConsents(c.env.DB, id),
    consentHistory(c.env.DB, id),
    all<Record<string, unknown>>(
      c.env.DB,
      `SELECT kind, summary, detail, created_at FROM activity
       WHERE contact_id = ? ORDER BY created_at DESC LIMIT 200`,
      id,
    ),
  ]);

  return c.json({
    contact: {
      ...contact,
      suppressed: contact.suppressed === 1,
      has_profile: contact.has_profile > 0,
    },
    profile: profile
      ? {
          ...profile,
          skills: parseLabels(profile.skills),
          industries: parseLabels(profile.industries),
          languages: parseLabels(profile.languages),
        }
      : null,
    consents,
    consentHistory: history,
    activity,
  });
});

const patchSchema = z.object({
  stage: z
    .enum(["prospect", "contacted", "registered", "vetted", "on_mission", "closed"])
    .optional(),
  internal_notes: z.string().max(4000).nullable().optional(),
  owner_user_id: z.string().nullable().optional(),
  first_name: z.string().trim().max(80).optional(),
  last_name: z.string().trim().max(80).optional(),
  linkedin_url: z.string().trim().max(300).nullable().optional(),
  source_note: z.string().trim().max(300).nullable().optional(),
});

contactRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const input = patchSchema.parse(await c.req.json());
  const before = await first<{ stage: string }>(
    c.env.DB,
    `SELECT stage FROM contacts WHERE id = ?`,
    id,
  );
  if (!before) throw notFound("No such contact");

  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (!fields.length) return c.json({ ok: true });

  await run(
    c.env.DB,
    `UPDATE contacts SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`,
    ...params,
    id,
  );
  if (input.stage && input.stage !== before.stage) {
    await logActivity(c.env.DB, {
      contactId: id,
      kind: "stage_changed",
      summary: `Stage: ${before.stage} → ${input.stage}`,
      actorUserId: c.get("user").id,
    });
  }
  return c.json({ ok: true });
});

/** Hard opt-out, applied by staff (a reply asking to stop, a phone call). */
contactRoutes.post("/:id/suppress", async (c) => {
  const id = c.req.param("id");
  const { reason, suppressed } = z
    .object({
      reason: z.string().trim().max(200).default("Asked not to be contacted"),
      suppressed: z.boolean().default(true),
    })
    .parse(await c.req.json().catch(() => ({})));

  const target = await first<{ id: string }>(c.env.DB, `SELECT id FROM contacts WHERE id = ?`, id);
  if (!target) throw notFound("No such contact");

  if (suppressed) {
    // The same routine the unsubscribe link uses, so a staff-side opt-out is
    // recorded identically — including the consent withdrawals.
    await suppressContact(c.env, {
      contactId: id,
      reason,
      source: "admin",
      actorUserId: c.get("user").id,
    });
  } else {
    await run(
      c.env.DB,
      `UPDATE contacts SET suppressed = 0, suppressed_at = NULL, suppressed_reason = NULL,
         updated_at = datetime('now') WHERE id = ?`,
      id,
    );
    await logActivity(c.env.DB, {
      contactId: id,
      kind: "note",
      summary: "Suppression lifted by staff",
      actorUserId: c.get("user").id,
    });
  }
  return c.json({ ok: true });
});

contactRoutes.post("/:id/note", async (c) => {
  const id = c.req.param("id");
  const { note } = z.object({ note: z.string().trim().min(1).max(2000) }).parse(await c.req.json());
  await logActivity(c.env.DB, {
    contactId: id,
    kind: "note",
    summary: note,
    actorUserId: c.get("user").id,
  });
  return c.json({ ok: true });
});

/** Staff download of a CV held in the pool. */
contactRoutes.get("/:id/cv", async (c) => {
  const id = c.req.param("id");
  const meta = await first<{ cv_filename: string | null; cv_mime: string | null }>(
    c.env.DB,
    `SELECT cv_filename, cv_mime FROM profiles WHERE contact_id = ?`,
    id,
  );
  const bytes = await getCv(c.env.DB, id);
  if (!bytes || !meta?.cv_filename) throw notFound("No CV on file for this freelancer");

  // Recorded before the bytes leave: a CV is the most personal thing in here.
  const user = c.get("user");
  await recordAccess(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: "cv_download",
    contactId: id,
    detail: meta.cv_filename,
    ip: clientIp(c.req.raw.headers),
  });
  return cvResponse(bytes, meta.cv_filename, meta.cv_mime);
});

/**
 * Bulk import. Everything lands as an opted-out prospect — a spreadsheet column
 * saying "agreed" is not consent, and this endpoint offers no way to fake one.
 */
contactRoutes.post("/import", async (c) => {
  const { csv, source, sourceNote } = z
    .object({
      csv: z.string().min(1).max(2_000_000),
      source: z.enum(["import", "linkedin", "referral", "event"]).default("import"),
      sourceNote: z.string().trim().max(200).optional(),
    })
    .parse(await c.req.json());

  const parsed = mapImportRows(parseCsv(csv), linkedinKey);
  if (!parsed.rows.length) {
    return c.json({
      ok: false,
      imported: 0,
      duplicates: 0,
      suppressed: 0,
      skipped: parsed.skipped,
      warnings: parsed.warnings,
      unmappedHeaders: parsed.unmappedHeaders,
    });
  }

  // A row is a duplicate if EITHER identity is already known: the same person
  // imported last month by email must not reappear via their LinkedIn URL.
  const emails = parsed.rows.flatMap((r) => (r.email ? [r.email] : []));
  const liKeys = parsed.rows.flatMap((r) => (r.linkedin_key ? [r.linkedin_key] : []));
  const existingEmails = new Set(
    (
      await selectByChunks<{ email: string }>(
        c.env.DB,
        (ph) => `SELECT email FROM contacts WHERE email IN (${ph})`,
        emails,
      )
    ).map((r) => r.email),
  );
  const existingKeys = new Set(
    (
      await selectByChunks<{ linkedin_key: string }>(
        c.env.DB,
        (ph) => `SELECT linkedin_key FROM contacts WHERE linkedin_key IN (${ph})`,
        liKeys,
      )
    ).map((r) => r.linkedin_key),
  );

  // People who previously opted out stay out, even though their record may be
  // long gone — under whichever identity they opted out with.
  const hashOf = new Map<string, string>();
  for (const row of parsed.rows) {
    if (row.email) hashOf.set(`e:${row.email}`, await emailHash(row.email));
    if (row.linkedin_key) hashOf.set(`l:${row.linkedin_key}`, await linkedinHash(row.linkedin_key));
  }
  const blockedHashes = await filterSuppressedHashes(c.env.DB, [...hashOf.values()]);
  const isBlocked = (row: (typeof parsed.rows)[number]) =>
    (row.email && blockedHashes.has(hashOf.get(`e:${row.email}`) ?? "")) ||
    (row.linkedin_key && blockedHashes.has(hashOf.get(`l:${row.linkedin_key}`) ?? ""));

  const isExisting = (row: (typeof parsed.rows)[number]) =>
    (row.email !== undefined && existingEmails.has(row.email)) ||
    (row.linkedin_key !== undefined && existingKeys.has(row.linkedin_key));

  let suppressedCount = 0;
  let duplicates = 0;
  const actor = c.get("user").id;
  let imported = 0;

  for (const row of parsed.rows) {
    if (isExisting(row)) {
      duplicates++;
      continue;
    }
    if (isBlocked(row)) {
      suppressedCount++;
      continue;
    }
    const id = uid();
    await run(
      c.env.DB,
      `INSERT INTO contacts (id, email, first_name, last_name, phone, linkedin_url, linkedin_key, source, source_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      row.email ?? null,
      row.first_name,
      row.last_name,
      row.phone ?? null,
      row.linkedin_url ?? null,
      row.linkedin_key ?? null,
      source,
      sourceNote ?? row.source_note ?? null,
    );
    imported++;
    await logActivity(c.env.DB, {
      contactId: id,
      kind: "imported",
      summary: `Imported from a ${source} list — opted out by default${row.email ? "" : " (LinkedIn only, no email)"}`,
      actorUserId: actor,
    });
  }

  return c.json({
    ok: true,
    imported,
    duplicates,
    suppressed: suppressedCount,
    skipped: parsed.skipped,
    warnings: parsed.warnings,
    unmappedHeaders: parsed.unmappedHeaders,
  });
});

/** CSV of the current contact list, for reporting outside the app. */
contactRoutes.get("/export/csv", async (c) => {
  const rows = await all<ContactRow>(
    c.env.DB,
    `SELECT ct.id, ct.email, ct.linkedin_key, ct.first_name, ct.last_name, ct.phone, ct.linkedin_url, ct.source,
            ct.stage, ct.suppressed, ct.outreach_count, ct.last_outreach_at, ct.created_at,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct WHERE ct.anonymized_at IS NULL ORDER BY ct.created_at DESC`,
  );
  const consents = await consentsFor(
    c.env.DB,
    rows.map((r) => r.id),
  );
  const csv = toCsv(
    [
      "Email",
      "First name",
      "Last name",
      "Phone",
      "LinkedIn",
      "Source",
      "Stage",
      "Do not contact",
      "Outreach touches",
      "Registered",
      "Consent: mission alerts",
      "Consent: news",
      "Added",
    ],
    rows.map((r) => {
      const cons = consents.get(r.id);
      return [
        r.email,
        r.first_name,
        r.last_name,
        r.phone ?? "",
        r.linkedin_url ?? "",
        r.source,
        r.stage,
        r.suppressed ? "yes" : "no",
        r.outreach_count,
        r.has_profile > 0 ? "yes" : "no",
        cons?.mission_alerts ? "yes" : "no",
        cons?.news ? "yes" : "no",
        r.created_at,
      ];
    }),
  );
  const user = c.get("user");
  await recordAccess(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: "contacts_export",
    detail: `${rows.length} contacts`,
    ip: clientIp(c.req.raw.headers),
  });
  await alertOnExport(c.env, {
    userId: user.id,
    userName: user.name,
    action: "contacts_export",
    rowCount: rows.length,
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nexian-contacts.csv"`,
    },
  });
});

/**
 * Record that someone answered, and what they said.
 *
 * The outcome is what a recruiter learns from; `replied_at` is what stops the
 * sequence. They are separate columns because the second must hold even when
 * the first is "we don't know yet" — an answer ends the chasing regardless of
 * its content.
 *
 * "Not interested" additionally suppresses: someone who took the trouble to say
 * no should not be on next quarter's list either.
 */
contactRoutes.post("/:id/reply", async (c) => {
  const id = c.req.param("id");
  const { outcome } = z
    .object({ outcome: z.enum(["interested", "not_now", "not_interested"]) })
    .parse(await c.req.json());

  const target = await first<{ id: string }>(c.env.DB, `SELECT id FROM contacts WHERE id = ?`, id);
  if (!target) throw notFound("No such contact");

  await run(
    c.env.DB,
    `UPDATE contacts
       SET replied_at = COALESCE(replied_at, datetime('now')), reply_outcome = ?,
           updated_at = datetime('now')
     WHERE id = ?`,
    outcome,
    id,
  );

  const label = {
    interested: "Replied — interested",
    not_now: "Replied — not right now",
    not_interested: "Replied — not interested",
  }[outcome];

  await logActivity(c.env.DB, {
    contactId: id,
    kind: "note",
    channel: "email",
    summary: `${label}. No further invitations will be sent.`,
    actorUserId: c.get("user").id,
  });

  if (outcome === "not_interested") {
    await suppressContact(c.env, {
      contactId: id,
      reason: "Replied that they are not interested",
      source: "admin",
      actorUserId: c.get("user").id,
    });
  }
  return c.json({ ok: true });
});
