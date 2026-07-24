/**
 * The permanent do-not-contact list.
 *
 * When someone opts out we suppress their contact record — but records get
 * deleted and anonymised, and the same person can be re-imported from a fresh
 * LinkedIn export months later. Keeping a hash of their address means the
 * opt-out survives the record, without us storing the address itself.
 */
import { sha256Hex } from "./crypto";
import { first, run, selectByChunks } from "./db";

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function emailHash(email: string): Promise<string> {
  return sha256Hex(normaliseEmail(email));
}

/**
 * A LinkedIn identity is suppressed under a prefixed hash in the same table.
 * The prefix keeps the two namespaces apart: an email that happened to equal a
 * LinkedIn key must never satisfy the other's lookup.
 */
export async function linkedinHash(linkedinKey: string): Promise<string> {
  return sha256Hex(`li:${linkedinKey}`);
}

export async function suppressEmail(db: D1Database, email: string, reason: string): Promise<void> {
  if (!email || email.includes("@invalid")) return;
  await storeHash(db, await emailHash(email), reason);
}

export async function suppressLinkedin(
  db: D1Database,
  linkedinKey: string,
  reason: string,
): Promise<void> {
  if (!linkedinKey) return;
  await storeHash(db, await linkedinHash(linkedinKey), reason);
}

async function storeHash(db: D1Database, hash: string, reason: string): Promise<void> {
  await run(
    db,
    `INSERT INTO suppression_list (email_hash, reason) VALUES (?, ?)
     ON CONFLICT(email_hash) DO NOTHING`,
    hash,
    reason.slice(0, 200),
  );
}

/**
 * Lift a suppression. The only caller is self-registration: someone choosing to
 * join is a clearer signal than any earlier opt-out, and leaving the hash would
 * lock them out of their own profile.
 */
export async function unsuppressEmail(db: D1Database, email: string): Promise<void> {
  await run(db, `DELETE FROM suppression_list WHERE email_hash = ?`, await emailHash(email));
}

export async function unsuppressLinkedin(db: D1Database, linkedinKey: string): Promise<void> {
  await run(
    db,
    `DELETE FROM suppression_list WHERE email_hash = ?`,
    await linkedinHash(linkedinKey),
  );
}

export async function isSuppressed(db: D1Database, email: string): Promise<boolean> {
  const row = await first<{ email_hash: string }>(
    db,
    `SELECT email_hash FROM suppression_list WHERE email_hash = ?`,
    await emailHash(email),
  );
  return row !== null;
}

/**
 * Bulk check for imports: which of these identities has ever opted out, by
 * email, by LinkedIn key, or both. Returns the matched hashes; callers map
 * them back to rows. Chunked because D1 caps bound parameters and an import
 * can be thousands of rows.
 */
export async function filterSuppressedHashes(
  db: D1Database,
  hashes: string[],
): Promise<Set<string>> {
  const rows = await selectByChunks<{ email_hash: string }>(
    db,
    (ph) => `SELECT email_hash FROM suppression_list WHERE email_hash IN (${ph})`,
    hashes,
  );
  return new Set(rows.map((r) => r.email_hash));
}

/** Convenience wrapper for the email-only callers that predate LinkedIn support. */
export async function filterSuppressed(db: D1Database, emails: string[]): Promise<Set<string>> {
  const byHash = new Map<string, string>();
  for (const email of emails) byHash.set(await emailHash(email), normaliseEmail(email));
  const matched = await filterSuppressedHashes(db, [...byHash.keys()]);
  const blocked = new Set<string>();
  for (const hash of matched) {
    const email = byHash.get(hash);
    if (email) blocked.add(email);
  }
  return blocked;
}
