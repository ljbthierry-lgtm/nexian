/**
 * Nightly jobs.
 *
 * Three things keep the pool honest without anyone touching it: the one allowed
 * outreach follow-up, the availability nudge that stops profiles going stale, and
 * the retention sweep that removes prospects who never engaged.
 *
 * Every job is bounded and idempotent: it marks what it did, so a second run in
 * the same day mails nobody twice.
 */
import { type Env, intVar } from "./env";
import { logActivity } from "./lib/activity";
import { availabilitySentence } from "./lib/availability";
import { resolveBaseUrl } from "./lib/baseUrl";
import { all, run } from "./lib/db";
import { EMAILABLE_SQL } from "./lib/deliverability";
import { log } from "./lib/log";
import { pruneRateLimits } from "./lib/rateLimit";
import { runRetentionSweep } from "./modules/admin/retention";
import { sendEmail } from "./modules/notifications/resend";
import { availabilityReminderEmail } from "./modules/notifications/templates";
import { createActionToken } from "./modules/notifications/tokens";
import { emailChannelSql, readChannelPriority } from "./modules/outreach/channel";
import { sendOutreachTo } from "./modules/outreach/send";
import { runInviteWave } from "./modules/outreach/wave";

/** Cap per run: a cron that suddenly mails thousands of people is a bug, not a feature. */
const MAX_FOLLOWUPS_PER_RUN = 100;
const MAX_REMINDERS_PER_RUN = 200;

interface CandidateRow {
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
  email_status: string | null;
  replied_at: string | null;
}

/**
 * Step 2 of the invite sequence, for prospects whose waiting period has passed.
 *
 * Skips anyone sitting in the LinkedIn queue: the touch budget is two in total
 * across channels, and a recruiter who queued somebody for a LinkedIn message
 * has claimed the second touch. Sending the email follow-up first would spend
 * it behind their back.
 */
export async function sendDueFollowUps(env: Env, now = new Date()): Promise<number> {
  const waitDays = intVar(env.FOLLOWUP_AFTER_DAYS, 10);
  const maxTouches = intVar(env.MAX_OUTREACH_TOUCHES, 2);
  if (maxTouches < 2) return 0;

  const cutoff = new Date(now.getTime() - waitDays * 86400000).toISOString();
  const preferred = await readChannelPriority(env.DB);
  const rows = await all<CandidateRow>(
    env.DB,
    `SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.source, ct.suppressed,
            ct.anonymized_at, ct.outreach_count, ct.last_outreach_at,
            ct.email_status, ct.replied_at,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct
     WHERE ct.suppressed = 0
       AND ct.anonymized_at IS NULL
       AND ${EMAILABLE_SQL}
       AND ct.replied_at IS NULL
       AND ct.outreach_count = 1
       AND ct.last_outreach_at IS NOT NULL
       AND ct.last_outreach_at < ?
       AND ct.linkedin_state != 'queued'
       AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.contact_id = ct.id)
       ${emailChannelSql(preferred)}
     ORDER BY ct.last_outreach_at ASC
     LIMIT ?`,
    cutoff,
    MAX_FOLLOWUPS_PER_RUN,
  );

  let sent = 0;
  for (const row of rows) {
    // sendOutreachTo re-checks eligibility, so a race with a manual send is safe.
    const result = await sendOutreachTo(env, row, env.COMPANY_NAME, null, now);
    if (result.sent) sent++;
  }
  if (sent) log.info("cron.followups", { sent });
  return sent;
}

/**
 * The availability nudge, to freelancers who granted mission-alert consent and
 * have not confirmed for a while.
 */
export async function sendAvailabilityReminders(env: Env, now = new Date()): Promise<number> {
  const everyDays = intVar(env.AVAILABILITY_REMINDER_DAYS, 90);
  const cutoff = new Date(now.getTime() - everyDays * 86400000).toISOString();
  const baseUrl = await resolveBaseUrl(env);
  const ctx = { companyName: env.COMPANY_NAME, baseUrl };

  const rows = await all<{
    id: string;
    email: string;
    first_name: string;
    availability: string;
    available_from: string | null;
    daily_rate: number | null;
  }>(
    env.DB,
    `SELECT ct.id, ct.email, ct.first_name, p.availability, p.available_from, p.daily_rate
     FROM contacts ct
     JOIN profiles p ON p.contact_id = ct.id
     JOIN consent_current cc
       ON cc.contact_id = ct.id AND cc.purpose = 'mission_alerts' AND cc.granted = 1
     WHERE ct.suppressed = 0
       AND ct.anonymized_at IS NULL
       AND ${EMAILABLE_SQL}
       AND COALESCE(p.last_confirmed_at, p.updated_at) < ?
       AND (p.last_reminded_at IS NULL OR p.last_reminded_at < ?)
     ORDER BY COALESCE(p.last_confirmed_at, p.updated_at) ASC
     LIMIT ?`,
    cutoff,
    cutoff,
    MAX_REMINDERS_PER_RUN,
  );

  let sent = 0;
  for (const row of rows) {
    const confirmToken = await createActionToken(env.DB, {
      purpose: "confirm_availability",
      contactId: row.id,
    });
    const portalToken = await createActionToken(env.DB, {
      purpose: "portal_link",
      contactId: row.id,
    });
    const unsubToken = await createActionToken(env.DB, {
      purpose: "unsubscribe",
      contactId: row.id,
      payload: { scope: "mission_alerts" },
    });
    const mail = availabilityReminderEmail(ctx, {
      firstName: row.first_name,
      availabilityLine: availabilitySentence(row),
      confirmUrl: `${baseUrl}/a/${confirmToken}`,
      portalUrl: `${baseUrl}/a/${portalToken}`,
      unsubscribeUrl: `${baseUrl}/a/${unsubToken}`,
    });
    const ok = await sendEmail(env, {
      to: row.email,
      subject: mail.subject,
      html: mail.html,
      template: "availability_reminder",
      contactId: row.id,
    });
    // Stamped whether or not the send succeeded, so a broken mail provider cannot
    // turn into a nightly retry storm against the same people.
    await run(
      env.DB,
      `UPDATE profiles SET last_reminded_at = datetime('now') WHERE contact_id = ?`,
      row.id,
    );
    if (ok) {
      sent++;
      await logActivity(env.DB, {
        contactId: row.id,
        kind: "email_sent",
        channel: "email",
        summary: "Sent the availability reminder",
      });
    }
  }
  if (sent) log.info("cron.reminders", { sent });
  return sent;
}

export async function runScheduledJobs(env: Env): Promise<void> {
  const started = Date.now();
  try {
    const wave = await runInviteWave(env);
    const followUps = await sendDueFollowUps(env);
    const reminders = await sendAvailabilityReminders(env);
    const anonymised = await runRetentionSweep(env);
    await pruneRateLimits(env.DB);
    log.info("cron.done", {
      waveSent: wave.sent,
      waveRemaining: wave.remaining,
      followUps,
      reminders,
      anonymised,
      ms: Date.now() - started,
    });
  } catch (e) {
    log.error("cron.failed", { error: e instanceof Error ? e.message : String(e) });
  }
}
