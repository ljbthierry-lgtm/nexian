/** Back-office contact management: the pipeline from cold prospect to pool member. */
import { Hono } from "hono";
import { z } from "zod";
import type { AppContext, Stage } from "../../env";
import { logActivity } from "../../lib/activity";
import { consentHistory, consentsFor, currentConsents } from "../../lib/consent";
import { mapImportRows, parseCsv, toCsv } from "../../lib/csv";
import { getCv } from "../../lib/cvStore";
import { all, first, run, uid } from "../../lib/db";
import { badRequest, notFound } from "../../lib/errors";
import { filterSuppressed, isSuppressed, suppressEmail } from "../../lib/suppression";
import { requireAuth } from "../../middleware/auth";

export const contactRoutes = new Hono<AppContext>();
contactRoutes.use("*", requireAuth());

const STAGES: Stage[] = ["prospect", "contacted", "registered", "vetted", "on_mission", "closed"];

interface ContactRow {
  id: string;
  email: string;
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
    `SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.phone, ct.linkedin_url, ct.source,
            ct.source_note, ct.stage, ct.suppressed, ct.suppressed_reason, ct.outreach_count,
            ct.last_outreach_at, ct.linkedin_state, ct.anonymized_at, ct.created_at,
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
  email: z.string().email(),
  first_name: z.string().trim().max(80).default(""),
  last_name: z.string().trim().max(80).default(""),
  phone: z.string().trim().max(40).optional(),
  linkedin_url: z.string().trim().max(300).optional(),
  source: z.enum(["manual", "import", "linkedin", "referral", "event"]).default("manual"),
  source_note: z.string().trim().max(300).optional(),
});

contactRoutes.post("/", async (c) => {
  const input = createSchema.parse(await c.req.json());
  const email = input.email.trim().toLowerCase();
  const existing = await first<{ id: string }>(
    c.env.DB,
    `SELECT id FROM contacts WHERE email = ?`,
    email,
  );
  if (existing) throw badRequest("That email address is already in the list.", "duplicate");
  if (await isSuppressed(c.env.DB, email)) {
    throw badRequest(
      "This person has asked never to be contacted again. They can only come back by registering themselves.",
      "suppressed",
    );
  }

  const id = uid();
  await run(
    c.env.DB,
    `INSERT INTO contacts (id, email, first_name, last_name, phone, linkedin_url, source, source_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    email,
    input.first_name,
    input.last_name,
    input.phone ?? null,
    input.linkedin_url ?? null,
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
          skills: safeArray(profile.skills),
          industries: safeArray(profile.industries),
          languages: safeArray(profile.languages),
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

  const target = await first<{ email: string }>(
    c.env.DB,
    `SELECT email FROM contacts WHERE id = ?`,
    id,
  );
  if (!target) throw notFound("No such contact");
  if (suppressed) await suppressEmail(c.env.DB, target.email, reason);

  await run(
    c.env.DB,
    suppressed
      ? `UPDATE contacts SET suppressed = 1, suppressed_at = datetime('now'), suppressed_reason = ?,
           stage = 'closed', updated_at = datetime('now') WHERE id = ?`
      : `UPDATE contacts SET suppressed = 0, suppressed_at = NULL, suppressed_reason = NULL,
           updated_at = datetime('now') WHERE id = ?`,
    ...(suppressed ? [reason, id] : [id]),
  );
  await logActivity(c.env.DB, {
    contactId: id,
    kind: suppressed ? "suppressed" : "note",
    summary: suppressed ? `Marked do-not-contact: ${reason}` : "Suppression lifted by staff",
    actorUserId: c.get("user").id,
  });
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
  return new Response(bytes, {
    headers: {
      "Content-Type": meta.cv_mime ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${meta.cv_filename.replace(/"/g, "")}"`,
    },
  });
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

  const parsed = mapImportRows(parseCsv(csv));
  if (!parsed.rows.length) {
    return c.json({
      ok: false,
      imported: 0,
      duplicates: 0,
      skipped: parsed.skipped,
      unmappedHeaders: parsed.unmappedHeaders,
    });
  }

  const emails = parsed.rows.map((r) => r.email);
  const existingRows = await all<{ email: string }>(
    c.env.DB,
    `SELECT email FROM contacts WHERE email IN (${emails.map(() => "?").join(", ")})`,
    ...emails,
  );
  const existing = new Set(existingRows.map((r) => r.email));
  // People who previously opted out stay out, even though their record may be
  // long gone — this is the whole point of keeping the hashed list.
  const blocked = await filterSuppressed(c.env.DB, emails);

  const fresh = parsed.rows.filter((r) => !existing.has(r.email) && !blocked.has(r.email));
  const actor = c.get("user").id;
  for (const row of fresh) {
    const id = uid();
    await run(
      c.env.DB,
      `INSERT INTO contacts (id, email, first_name, last_name, phone, linkedin_url, source, source_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      row.email,
      row.first_name,
      row.last_name,
      row.phone ?? null,
      row.linkedin_url ?? null,
      source,
      sourceNote ?? row.source_note ?? null,
    );
    await logActivity(c.env.DB, {
      contactId: id,
      kind: "imported",
      summary: `Imported from a ${source} list — opted out by default`,
      actorUserId: actor,
    });
  }

  return c.json({
    ok: true,
    imported: fresh.length,
    duplicates: parsed.rows.filter((r) => existing.has(r.email)).length,
    suppressed: blocked.size,
    skipped: parsed.skipped,
    unmappedHeaders: parsed.unmappedHeaders,
  });
});

/** CSV of the current contact list, for reporting outside the app. */
contactRoutes.get("/export/csv", async (c) => {
  const rows = await all<ContactRow>(
    c.env.DB,
    `SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.phone, ct.linkedin_url, ct.source,
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
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nexian-contacts.csv"`,
    },
  });
});

function safeArray(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
