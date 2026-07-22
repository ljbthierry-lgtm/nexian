/**
 * Stopping contact with someone, in one place.
 *
 * This used to be written out three times — the unsubscribe link, the staff
 * "do not contact" button, and profile deletion — and only the first of them
 * also withdrew the marketing consents. The result was a contact showing
 * "Do not contact" and "Opted in · alerts" side by side: no mail went out,
 * because the audience query filters suppressed people first, but the ledger
 * disagreed with the record, and any future query that read consent without
 * also checking `suppressed` would have mailed them.
 */
import type { Env } from "../env";
import { logActivity } from "./activity";
import { MARKETING_PURPOSES, recordConsent } from "./consent";
import { run } from "./db";
import { suppressEmail } from "./suppression";

export interface SuppressOptions {
  contactId: string;
  email: string;
  reason: string;
  /** Where the decision came from, for the consent ledger. */
  source: "unsubscribe_link" | "admin" | "profile_page";
  actorUserId?: string | null;
}

/**
 * Mark a contact as never-contact-again: the permanent hashed entry, the row
 * flags, the withdrawal of every marketing consent, and the audit line.
 */
export async function suppressContact(env: Env, opts: SuppressOptions): Promise<void> {
  // The hash first, and before any caller overwrites the address: it is what
  // makes the opt-out survive deletion and block a re-import months later.
  await suppressEmail(env.DB, opts.email, opts.reason);

  await run(
    env.DB,
    `UPDATE contacts
       SET suppressed = 1, suppressed_at = datetime('now'), suppressed_reason = ?,
           stage = 'closed', updated_at = datetime('now')
     WHERE id = ?`,
    opts.reason.slice(0, 200),
    opts.contactId,
  );

  for (const purpose of MARKETING_PURPOSES) {
    await recordConsent(env, {
      contactId: opts.contactId,
      purpose,
      granted: false,
      source: opts.source,
      actor: opts.actorUserId ?? null,
    });
  }

  await logActivity(env.DB, {
    contactId: opts.contactId,
    kind: "suppressed",
    summary: `Marked do-not-contact: ${opts.reason}`,
    actorUserId: opts.actorUserId ?? null,
  });
}
