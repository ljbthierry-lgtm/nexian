/** Admin: staff accounts, the skill and industry lists, and GDPR housekeeping. */
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { ACCESS_ACTIONS, ACCESS_LABEL, type AccessAction, recordAccess } from "../../lib/accessLog";
import { resolveBaseUrl } from "../../lib/baseUrl";
import { toCsv } from "../../lib/csv";
import { all, first, run, uid } from "../../lib/db";
import { badRequest, notFound } from "../../lib/errors";
import { clientIp } from "../../lib/rateLimit";
import { requireAuth, requireRole } from "../../middleware/auth";
import { sendEmail } from "../notifications/resend";
import {
  availabilityReminderEmail,
  followUpEmail,
  inviteEmail,
  setPasswordEmail,
  welcomeEmail,
} from "../notifications/templates";
import { createActionToken } from "../notifications/tokens";
import { findExpiredProspects, runRetentionSweep } from "./retention";

export const adminRoutes = new Hono<AppContext>();
adminRoutes.use("*", requireAuth(), requireRole("admin"));

/* ------------------------------------------------------------------ users */

adminRoutes.get("/users", async (c) => {
  const users = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT id, email, name, role, active, created_at,
            CASE WHEN pw_hash IS NULL THEN 0 ELSE 1 END AS has_password
     FROM users ORDER BY created_at`,
  );
  return c.json({ users });
});

adminRoutes.post("/users", async (c) => {
  const input = z
    .object({
      email: z.string().email(),
      name: z.string().trim().min(1).max(120),
      role: z.enum(["admin", "recruiter"]).default("recruiter"),
    })
    .parse(await c.req.json());

  const email = input.email.trim().toLowerCase();
  const clash = await first<{ id: string }>(
    c.env.DB,
    `SELECT id FROM users WHERE email = ?`,
    email,
  );
  if (clash) throw badRequest("Someone already has that email address.", "duplicate");

  const id = uid();
  await run(
    c.env.DB,
    `INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)`,
    id,
    email,
    input.name,
    input.role,
  );

  const baseUrl = await resolveBaseUrl(c.env);
  const token = await createActionToken(c.env.DB, { purpose: "set_password", userId: id });
  const mail = setPasswordEmail(
    { companyName: c.env.COMPANY_NAME, baseUrl },
    { name: input.name, url: `${baseUrl}/set-password?token=${token}` },
  );
  const sent = await sendEmail(c.env, {
    to: email,
    subject: mail.subject,
    html: mail.html,
    template: "set_password",
  });
  // Surfaced so an admin can hand the link over another way when mail is not
  // configured yet, instead of silently creating an account nobody can enter.
  return c.json({
    ok: true,
    id,
    invitationSent: sent,
    setPasswordUrl: sent ? undefined : `${baseUrl}/set-password?token=${token}`,
  });
});

adminRoutes.patch("/users/:id", async (c) => {
  const id = c.req.param("id");
  const input = z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      role: z.enum(["admin", "recruiter"]).optional(),
      active: z.boolean().optional(),
    })
    .parse(await c.req.json());

  if (input.active === false || input.role === "recruiter") {
    // Never let the last admin lock everyone out of the back office.
    const others = await first<{ n: number }>(
      c.env.DB,
      `SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?`,
      id,
    );
    const target = await first<{ role: string }>(
      c.env.DB,
      `SELECT role FROM users WHERE id = ?`,
      id,
    );
    if (target?.role === "admin" && (others?.n ?? 0) === 0) {
      throw badRequest("This is the last active admin — promote someone else first.", "last_admin");
    }
  }

  const fields: string[] = [];
  const params: unknown[] = [];
  if (input.name !== undefined) {
    fields.push("name = ?");
    params.push(input.name);
  }
  if (input.role !== undefined) {
    fields.push("role = ?");
    params.push(input.role);
  }
  if (input.active !== undefined) {
    fields.push("active = ?");
    params.push(input.active ? 1 : 0);
  }
  if (!fields.length) return c.json({ ok: true });

  await run(c.env.DB, `UPDATE users SET ${fields.join(", ")} WHERE id = ?`, ...params, id);
  if (input.active === false) {
    await run(c.env.DB, `DELETE FROM sessions WHERE user_id = ?`, id);
  }
  return c.json({ ok: true });
});

/* --------------------------------------------------------------- taxonomy */

adminRoutes.get("/taxonomy", async (c) => {
  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT id, kind, label, sort, active FROM taxonomy ORDER BY kind, sort, label`,
  );
  return c.json({ taxonomy: rows });
});

adminRoutes.post("/taxonomy", async (c) => {
  const input = z
    .object({
      kind: z.enum(["skill", "industry", "language"]),
      label: z.string().trim().min(1).max(80),
      sort: z.number().int().min(0).max(9999).default(500),
    })
    .parse(await c.req.json());
  const id = uid();
  try {
    await run(
      c.env.DB,
      `INSERT INTO taxonomy (id, kind, label, sort) VALUES (?, ?, ?, ?)`,
      id,
      input.kind,
      input.label,
      input.sort,
    );
  } catch {
    throw badRequest(`“${input.label}” is already in the ${input.kind} list.`, "duplicate");
  }
  return c.json({ ok: true, id });
});

adminRoutes.patch("/taxonomy/:id", async (c) => {
  const input = z
    .object({
      label: z.string().trim().min(1).max(80).optional(),
      sort: z.number().int().min(0).max(9999).optional(),
      active: z.boolean().optional(),
    })
    .parse(await c.req.json());
  const fields: string[] = [];
  const params: unknown[] = [];
  if (input.label !== undefined) {
    fields.push("label = ?");
    params.push(input.label);
  }
  if (input.sort !== undefined) {
    fields.push("sort = ?");
    params.push(input.sort);
  }
  if (input.active !== undefined) {
    fields.push("active = ?");
    params.push(input.active ? 1 : 0);
  }
  if (!fields.length) return c.json({ ok: true });
  const res = await run(
    c.env.DB,
    `UPDATE taxonomy SET ${fields.join(", ")} WHERE id = ?`,
    ...params,
    c.req.param("id"),
  );
  if (!res.meta.changes) throw notFound("No such entry");
  return c.json({ ok: true });
});

/* --------------------------------------------------------------- retention */

/** What the nightly sweep would remove, so it is never a surprise. */
adminRoutes.get("/retention/preview", async (c) => {
  const candidates = await findExpiredProspects(c.env);
  return c.json({
    retentionDays: Number(c.env.PROSPECT_RETENTION_DAYS),
    count: candidates.length,
    sample: candidates.slice(0, 20).map((x) => ({ email: x.email, added: x.created_at })),
  });
});

adminRoutes.post("/retention/run", async (c) => {
  const count = await runRetentionSweep(c.env);
  return c.json({ ok: true, anonymised: count });
});

/** The permanent do-not-contact list — counts only; the addresses are hashed. */
adminRoutes.get("/suppression", async (c) => {
  const row = await first<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM suppression_list`);
  const recent = await all<{ reason: string; created_at: string }>(
    c.env.DB,
    `SELECT reason, created_at FROM suppression_list ORDER BY created_at DESC LIMIT 20`,
  );
  return c.json({ total: row?.n ?? 0, recent });
});

/** Delivery history, for answering "did they actually get it?". */
adminRoutes.get("/email-log", async (c) => {
  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT to_email, template, subject, status, error, created_at
     FROM email_log ORDER BY created_at DESC LIMIT 200`,
  );
  return c.json({ emails: rows });
});

/**
 * Who read personal data: CV downloads and bulk exports.
 *
 * Admin-only, because it names members of staff. The freelancer-facing export
 * deliberately does not include it — telling a data subject which colleague
 * opened their file would expose internal operations without helping them.
 */
interface AccessLogRow {
  id: string;
  user_id: string | null;
  user_name: string;
  action: AccessAction;
  contact_id: string | null;
  detail: string | null;
  ip: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
}

/**
 * Read the log, narrowed the way somebody investigating actually narrows it:
 * by person, by what they did, by when, or by whose record was touched.
 */
async function queryAccessLog(c: Context<AppContext>, limit: number): Promise<AccessLogRow[]> {
  const q = c.req.query();
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.contactId) {
    where.push("a.contact_id = ?");
    params.push(q.contactId);
  }
  if (q.userId) {
    where.push("a.user_id = ?");
    params.push(q.userId);
  }
  if (q.action && ACCESS_ACTIONS.includes(q.action as AccessAction)) {
    where.push("a.action = ?");
    params.push(q.action);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from ?? "")) {
    where.push("a.created_at >= ?");
    params.push(`${q.from} 00:00:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.to ?? "")) {
    where.push("a.created_at <= ?");
    params.push(`${q.to} 23:59:59`);
  }

  return all<AccessLogRow>(
    c.env.DB,
    `SELECT a.id, a.user_id, a.user_name, a.action, a.contact_id, a.detail, a.ip, a.created_at,
            ct.first_name, ct.last_name
     FROM access_log a
     LEFT JOIN contacts ct ON ct.id = a.contact_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.created_at DESC LIMIT ?`,
    ...params,
    limit,
  );
}

function whoseRecord(row: AccessLogRow): string {
  const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  if (name) return name;
  // A contact that has since been deleted still leaves its id in the log; saying
  // so is more honest than a blank cell.
  return row.contact_id ? "(deleted record)" : "";
}

adminRoutes.get("/access-log", async (c) => {
  const rows = await queryAccessLog(c, 300);
  const summary = await first<{ downloads: number; exports: number; people: number }>(
    c.env.DB,
    `SELECT
       SUM(CASE WHEN action = 'cv_download' THEN 1 ELSE 0 END) AS downloads,
       SUM(CASE WHEN action IN ('pool_export','contacts_export') THEN 1 ELSE 0 END) AS exports,
       COUNT(DISTINCT user_id) AS people
     FROM access_log WHERE created_at > datetime('now', '-30 days')`,
  );
  // Offered as filter options so the screen only lists staff who actually appear.
  const staff = await all<{ user_id: string; user_name: string }>(
    c.env.DB,
    `SELECT DISTINCT user_id, user_name FROM access_log
     WHERE user_id IS NOT NULL ORDER BY user_name`,
  );

  return c.json({
    entries: rows.map((r) => ({
      ...r,
      label: ACCESS_LABEL[r.action],
      whose: whoseRecord(r),
    })),
    staff,
    last30Days: {
      cvDownloads: summary?.downloads ?? 0,
      bulkExports: summary?.exports ?? 0,
      staffActive: summary?.people ?? 0,
    },
  });
});

/**
 * The log as a file. An audit trail that cannot leave the application is not
 * much use to whoever has to answer a question about it — a regulator, a
 * client, or a freelancer asking who has seen their CV.
 *
 * Taking this export is itself recorded, so the audit covers its own reading.
 */
adminRoutes.get("/access-log/export/csv", async (c) => {
  const rows = await queryAccessLog(c, 10_000);
  const csv = toCsv(
    ["When (UTC)", "Who", "What", "Whose record", "Detail", "IP"],
    rows.map((r) => [
      r.created_at,
      r.user_name || "(removed user)",
      ACCESS_LABEL[r.action],
      whoseRecord(r),
      r.detail ?? "",
      r.ip ?? "",
    ]),
  );

  const user = c.get("user");
  await recordAccess(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: "access_log_export",
    detail: `${rows.length} entries`,
    ip: clientIp(c.req.raw.headers),
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nexian-access-log.csv"`,
    },
  });
});

/* ---------------------------------------------------------------- previews */

/**
 * The emails exactly as a freelancer receives them, rendered with sample data.
 *
 * Sample data on purpose: previewing must never read a real freelancer's
 * record, and a preview link must never be a live token — the buttons in these
 * renders point at the registration page or nowhere.
 */
adminRoutes.get("/preview/email", async (c) => {
  const template = c.req.query("template") ?? "invite";
  const baseUrl = await resolveBaseUrl(c.env);
  const ctx = { companyName: c.env.COMPANY_NAME, baseUrl };
  const sample = {
    firstName: "Sofie",
    senderName: "Laurent Thierry",
    registerUrl: `${baseUrl}/join`,
    optOutUrl: `${baseUrl}/join#preview-only`,
    portalUrl: `${baseUrl}/join#preview-only`,
    unsubscribeUrl: `${baseUrl}/join#preview-only`,
  };

  let rendered: { subject: string; html: string };
  switch (template) {
    case "invite":
      rendered = inviteEmail(ctx, { ...sample, source: "linkedin" });
      break;
    case "followup":
      rendered = followUpEmail(ctx, sample);
      break;
    case "welcome":
      rendered = welcomeEmail(ctx, {
        firstName: sample.firstName,
        portalUrl: sample.portalUrl,
        consentSummary: ["Store my profile to match me with missions", "Mission alerts"],
      });
      break;
    case "reminder":
      rendered = availabilityReminderEmail(ctx, {
        firstName: sample.firstName,
        availabilityLine: "you are available from 1 September 2026",
        confirmUrl: sample.portalUrl,
        portalUrl: sample.portalUrl,
        unsubscribeUrl: sample.unsubscribeUrl,
      });
      break;
    default:
      throw badRequest("Unknown template — use invite, followup, welcome or reminder.");
  }
  return c.json(rendered);
});

/* ---------------------------------------------------------------- alerts */

/**
 * Open security alerts. Read from the database rather than an inbox, so they
 * are visible whether or not outbound email was working when they were raised.
 */
adminRoutes.get("/alerts", async (c) => {
  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT id, kind, severity, summary, detail, user_name, emailed, acknowledged_at, created_at
     FROM alerts ORDER BY acknowledged_at IS NOT NULL, created_at DESC LIMIT 100`,
  );
  const open = rows.filter((r) => r.acknowledged_at === null).length;
  return c.json({ alerts: rows, open });
});

adminRoutes.post("/alerts/:id/acknowledge", async (c) => {
  const user = c.get("user");
  const res = await run(
    c.env.DB,
    `UPDATE alerts SET acknowledged_at = datetime('now'), acknowledged_by = ?
     WHERE id = ? AND acknowledged_at IS NULL`,
    user.name,
    c.req.param("id"),
  );
  if (!res.meta.changes) throw notFound("No such open alert");
  return c.json({ ok: true });
});
