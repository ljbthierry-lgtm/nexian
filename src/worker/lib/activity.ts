/**
 * The per-contact activity trail.
 *
 * This is the GDPR accountability record: every outbound touch, consent change,
 * profile edit, export and deletion lands here. Writing it must never break the
 * flow that triggered it, so failures are logged and swallowed.
 */
import { run, uid } from "./db";
import { log } from "./log";

export type ActivityKind =
  | "created"
  | "imported"
  | "email_sent"
  | "email_failed"
  | "linkedin_queued"
  | "linkedin_sent"
  | "registered"
  | "profile_updated"
  | "cv_uploaded"
  | "availability_confirmed"
  | "consent_granted"
  | "consent_revoked"
  | "stage_changed"
  | "suppressed"
  | "note"
  | "exported"
  | "anonymized"
  | "deleted";

export interface ActivityInput {
  contactId: string;
  kind: ActivityKind;
  summary: string;
  channel?: string | null;
  detail?: string | null;
  actorUserId?: string | null;
}

export async function logActivity(db: D1Database, input: ActivityInput): Promise<void> {
  try {
    await run(
      db,
      `INSERT INTO activity (id, contact_id, kind, channel, summary, detail, actor_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      uid(),
      input.contactId,
      input.kind,
      input.channel ?? null,
      input.summary,
      input.detail ?? null,
      input.actorUserId ?? null,
    );
  } catch (e) {
    log.error("activity.write_failed", {
      contact: input.contactId,
      kind: input.kind,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
