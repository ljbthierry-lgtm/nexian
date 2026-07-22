/**
 * Telling someone that a lot of personal data just left the building.
 *
 * The access log answers "who took what" after you go looking. An alert is the
 * part that makes you look. The security review's remaining gap was precisely
 * this: downloads were recorded, but a departing recruiter exporting the whole
 * pool at 19:00 on a Friday produced a row nobody would read until it mattered.
 *
 * Two decisions worth keeping:
 *   - the alert is written to the database FIRST and emailed second. Outbound
 *     email is the single most likely thing to be unconfigured or broken at the
 *     moment something alarming happens, and an alert nobody can see is not an
 *     alert. The Access log screen shows open alerts whether or not mail works.
 *   - alerts are throttled per kind. One bad afternoon should produce one
 *     warning, not fifty — a channel that cries wolf gets muted by its reader,
 *     which is the same as having no channel.
 */
import type { Env } from "../env";
import { all, first, run, uid } from "./db";
import { log } from "./log";

export type AlertKind = "large_export" | "repeated_export";
export type AlertSeverity = "info" | "warning" | "critical";

/** One alert of a given kind per actor per this many minutes. */
export const ALERT_THROTTLE_MINUTES = 60;

export interface ExportEvent {
  userId: string | null;
  userName: string;
  action: "pool_export" | "contacts_export" | "access_log_export";
  rowCount: number;
  /** Bulk exports by this person in the last 24 hours, including this one. */
  recentExports: number;
}

export interface ExportThresholds {
  /** A single export of at least this many records is worth a look. */
  rows: number;
  /** This many bulk exports within a day by one person is worth a look. */
  perDay: number;
}

export const DEFAULT_EXPORT_THRESHOLDS: ExportThresholds = { rows: 100, perDay: 3 };

export interface AlertDraft {
  kind: AlertKind;
  severity: AlertSeverity;
  summary: string;
  detail: string;
}

/**
 * Does this export deserve an alert? Pure, so the thresholds can be tested
 * without a database or a mail provider.
 */
export function assessExport(
  event: ExportEvent,
  thresholds: ExportThresholds = DEFAULT_EXPORT_THRESHOLDS,
): AlertDraft | null {
  const who = event.userName || "A staff member";
  const what =
    event.action === "pool_export"
      ? "the talent pool"
      : event.action === "contacts_export"
        ? "the contact list"
        : "the access log";

  // Repetition first: three exports of forty rows is a more interesting shape
  // than one export of a hundred, and reporting only the size would miss it.
  if (event.recentExports >= thresholds.perDay) {
    return {
      kind: "repeated_export",
      severity: "critical",
      summary: `${who} has exported data ${event.recentExports} times today`,
      detail: `Most recent: ${what}, ${event.rowCount} records. Repeated bulk exports by one person in a single day are unusual — worth confirming it was expected.`,
    };
  }
  if (event.rowCount >= thresholds.rows) {
    return {
      kind: "large_export",
      severity: "warning",
      summary: `${who} exported ${event.rowCount} records from ${what}`,
      detail: `A single export of ${event.rowCount} records. Every freelancer in it had their details leave the application in one file.`,
    };
  }
  return null;
}

/** Write the alert, unless an identical one is already fresh. Returns its id, or null. */
export async function raiseAlert(
  env: Env,
  draft: AlertDraft,
  actor: { userId: string | null; userName: string },
  now = new Date(),
): Promise<string | null> {
  const since = new Date(now.getTime() - ALERT_THROTTLE_MINUTES * 60000).toISOString();
  const recent = await first<{ id: string }>(
    env.DB,
    `SELECT id FROM alerts
     WHERE kind = ? AND COALESCE(user_id, '') = COALESCE(?, '') AND created_at > ?
     LIMIT 1`,
    draft.kind,
    actor.userId,
    since,
  );
  if (recent) return null;

  const id = uid();
  await run(
    env.DB,
    `INSERT INTO alerts (id, kind, severity, summary, detail, user_id, user_name)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    draft.kind,
    draft.severity,
    draft.summary,
    draft.detail,
    actor.userId,
    actor.userName,
  );
  log.warn("alert.raised", { kind: draft.kind, user: actor.userId, severity: draft.severity });
  return id;
}

/** Every admin who could act on an alert. */
export async function adminRecipients(db: D1Database): Promise<{ email: string; name: string }[]> {
  return all<{ email: string; name: string }>(
    db,
    `SELECT email, name FROM users WHERE role = 'admin' AND active = 1 AND email IS NOT NULL`,
  );
}

export async function markAlertEmailed(db: D1Database, id: string): Promise<void> {
  await run(db, `UPDATE alerts SET emailed = 1 WHERE id = ?`, id);
}
