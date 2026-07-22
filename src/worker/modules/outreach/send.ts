/**
 * The one way an invitation or follow-up email leaves the app.
 *
 * The manual "Send invite" button, the nightly follow-up job and the invite
 * wave all pass through here, so the eligibility decision, the touch counter
 * and the audit line cannot differ by path. Lives apart from the route file so
 * the cron and the wave engine can import it without dragging in HTTP.
 */
import { type Env, intVar } from "../../env";
import { logActivity } from "../../lib/activity";
import { resolveBaseUrl } from "../../lib/baseUrl";
import { run } from "../../lib/db";
import { sendEmail } from "../notifications/resend";
import { followUpEmail, inviteEmail } from "../notifications/templates";
import { createActionToken } from "../notifications/tokens";
import { type OutreachCandidate, decideOutreach } from "./eligibility";

export function policyOf(env: Env) {
  return {
    maxTouches: intVar(env.MAX_OUTREACH_TOUCHES, 2),
    followUpAfterDays: intVar(env.FOLLOWUP_AFTER_DAYS, 10),
  };
}

export interface OutreachCandidateRow {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  source: string;
  suppressed: number;
  anonymized_at: string | null;
  outreach_count: number;
  last_outreach_at: string | null;
  has_profile: number;
}

export const CANDIDATE_SELECT = `
  SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.source, ct.suppressed,
         ct.anonymized_at, ct.outreach_count, ct.last_outreach_at,
         (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
  FROM contacts ct`;

export function toCandidate(row: OutreachCandidateRow): OutreachCandidate {
  return {
    suppressed: row.suppressed === 1,
    anonymized: row.anonymized_at !== null,
    hasProfile: row.has_profile > 0,
    outreachCount: row.outreach_count,
    lastOutreachAt: row.last_outreach_at,
  };
}

export interface OutreachSendResult {
  id: string;
  email: string;
  sent: boolean;
  reason?: string;
  kind?: string;
}

/**
 * Send the next step of the sequence to one contact.
 *
 * The decision is re-taken here, server-side, for every recipient — a caller
 * may believe someone is eligible, but this is what decides.
 */
export async function sendOutreachTo(
  env: Env,
  row: OutreachCandidateRow,
  senderName: string,
  actorUserId: string | null,
  now = new Date(),
): Promise<OutreachSendResult> {
  const decision = decideOutreach(toCandidate(row), policyOf(env), now);
  if (!decision.allowed) {
    return { id: row.id, email: row.email ?? "", sent: false, reason: decision.reason };
  }
  // Email is this sender's channel; a LinkedIn-only prospect is not a failure,
  // just someone whose invitation lives in the manual queue instead.
  if (!row.email) {
    return {
      id: row.id,
      email: "",
      sent: false,
      reason: "No email address — reach them through the LinkedIn queue",
    };
  }

  const baseUrl = await resolveBaseUrl(env);
  const ctx = { companyName: env.COMPANY_NAME, baseUrl };
  const optOutToken = await createActionToken(env.DB, {
    purpose: "unsubscribe",
    contactId: row.id,
    payload: { scope: "all" },
  });
  const registerUrl = `${baseUrl}/join`;
  const optOutUrl = `${baseUrl}/a/${optOutToken}`;

  const mail =
    decision.kind === "invite"
      ? inviteEmail(ctx, {
          firstName: row.first_name,
          source: row.source,
          registerUrl,
          optOutUrl,
          senderName,
        })
      : followUpEmail(ctx, {
          firstName: row.first_name,
          registerUrl,
          optOutUrl,
          senderName,
        });

  const ok = await sendEmail(env, {
    to: row.email,
    subject: mail.subject,
    html: mail.html,
    template: decision.kind,
    contactId: row.id,
  });

  if (ok) {
    await run(
      env.DB,
      `UPDATE contacts
         SET outreach_count = outreach_count + 1,
             first_outreach_at = COALESCE(first_outreach_at, datetime('now')),
             last_outreach_at = datetime('now'),
             stage = CASE WHEN stage = 'prospect' THEN 'contacted' ELSE stage END,
             updated_at = datetime('now')
       WHERE id = ?`,
      row.id,
    );
  }
  await logActivity(env.DB, {
    contactId: row.id,
    kind: ok ? "email_sent" : "email_failed",
    channel: "email",
    summary: ok
      ? `Sent the ${decision.kind === "invite" ? "invitation" : "follow-up"} email`
      : `Failed to send the ${decision.kind} email`,
    actorUserId,
  });

  return {
    id: row.id,
    email: row.email,
    sent: ok,
    kind: decision.kind,
    reason: ok ? undefined : "The email provider rejected the message",
  };
}
