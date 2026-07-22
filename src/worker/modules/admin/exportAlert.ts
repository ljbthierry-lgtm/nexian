/**
 * The bridge between "an export happened" and "somebody hears about it".
 *
 * Kept out of the export routes themselves so all three of them call one line,
 * and out of lib/alerts.ts so that module stays free of email and database
 * counting. Nothing in here may throw into the export: a failure to alert is
 * logged, never a reason the recruiter's download fails.
 */
import type { Env } from "../../env";
import {
  type ExportEvent,
  adminRecipients,
  assessExport,
  markAlertEmailed,
  raiseAlert,
} from "../../lib/alerts";
import { resolveBaseUrl } from "../../lib/baseUrl";
import { first } from "../../lib/db";
import { log } from "../../lib/log";
import { sendEmail } from "../notifications/resend";
import { alertEmail } from "../notifications/templates";

export async function alertOnExport(
  env: Env,
  input: Omit<ExportEvent, "recentExports">,
): Promise<void> {
  try {
    // Counted from the access log, which was written a moment ago — so this
    // includes the export that just happened.
    const row = await first<{ n: number }>(
      env.DB,
      `SELECT COUNT(*) AS n FROM access_log
       WHERE COALESCE(user_id, '') = COALESCE(?, '')
         AND action IN ('pool_export', 'contacts_export', 'access_log_export')
         AND created_at > datetime('now', '-1 day')`,
      input.userId,
    );
    const draft = assessExport({ ...input, recentExports: row?.n ?? 1 });
    if (!draft) return;

    const id = await raiseAlert(env, draft, {
      userId: input.userId,
      userName: input.userName,
    });
    if (!id) return; // throttled — an identical alert is still fresh

    const admins = await adminRecipients(env.DB);
    if (!admins.length) return;

    const baseUrl = await resolveBaseUrl(env);
    const mail = alertEmail(
      { companyName: env.COMPANY_NAME, baseUrl },
      {
        summary: draft.summary,
        detail: draft.detail,
        severity: draft.severity,
        when: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
      },
    );
    let anySent = false;
    for (const admin of admins) {
      const ok = await sendEmail(env, {
        to: admin.email,
        subject: mail.subject,
        html: mail.html,
        template: "security_alert",
      });
      anySent = anySent || ok;
    }
    if (anySent) await markAlertEmailed(env.DB, id);
  } catch (e) {
    // The alert is best-effort; the export is not.
    log.error("alert.export_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}
