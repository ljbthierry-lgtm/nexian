/**
 * Data retention.
 *
 * Holding a cold prospect's details forever is not defensible under GDPR: the
 * legitimate interest that justified contacting them expires when they clearly
 * are not interested. This sweep anonymises prospects who never registered and
 * never engaged, after the configured retention period.
 *
 * Registered freelancers are never touched here — they have an active consent
 * and their own delete button.
 */
import type { Env } from "../../env";
import { intVar } from "../../env";
import { logActivity } from "../../lib/activity";
import { all, run } from "../../lib/db";
import { log } from "../../lib/log";

export interface RetentionCandidate {
  id: string;
  email: string;
  created_at: string;
  last_outreach_at: string | null;
}

/** Prospects with no profile, past the retention window, not already anonymised. */
export async function findExpiredProspects(
  env: Env,
  now = new Date(),
): Promise<RetentionCandidate[]> {
  const days = intVar(env.PROSPECT_RETENTION_DAYS, 365);
  const cutoff = new Date(now.getTime() - days * 86400000).toISOString();
  return all<RetentionCandidate>(
    env.DB,
    `SELECT ct.id, ct.email, ct.created_at, ct.last_outreach_at
     FROM contacts ct
     WHERE ct.anonymized_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.contact_id = ct.id)
       AND COALESCE(ct.last_outreach_at, ct.created_at) < ?
     LIMIT 500`,
    cutoff,
  );
}

/**
 * Strip the personal fields but keep the row: the activity and consent trail is
 * the evidence that we contacted this person lawfully and then cleaned up.
 */
export async function anonymiseContact(env: Env, id: string): Promise<void> {
  await run(
    env.DB,
    `UPDATE contacts
       SET first_name = '', last_name = '', phone = NULL, linkedin_url = NULL,
           email = 'expired+' || id || '@invalid', internal_notes = NULL,
           source_note = NULL, stage = 'closed',
           anonymized_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    id,
  );
  await run(env.DB, `DELETE FROM action_tokens WHERE contact_id = ?`, id);
  await logActivity(env.DB, {
    contactId: id,
    kind: "anonymized",
    summary: "Personal details removed — retention period expired without registration",
  });
}

export async function runRetentionSweep(env: Env, now = new Date()): Promise<number> {
  const expired = await findExpiredProspects(env, now);
  for (const candidate of expired) await anonymiseContact(env, candidate.id);
  if (expired.length) log.info("retention.swept", { count: expired.length });
  return expired.length;
}
