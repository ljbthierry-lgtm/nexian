/**
 * The permanent do-not-contact list.
 *
 * When someone opts out we suppress their contact record — but records get
 * deleted and anonymised, and the same person can be re-imported from a fresh
 * LinkedIn export months later. Keeping a hash of their address means the
 * opt-out survives the record, without us storing the address itself.
 */
import { sha256Hex } from "./crypto";
import { all, first, run } from "./db";

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function emailHash(email: string): Promise<string> {
  return sha256Hex(normaliseEmail(email));
}

export async function suppressEmail(db: D1Database, email: string, reason: string): Promise<void> {
  if (!email || email.includes("@invalid")) return;
  await run(
    db,
    `INSERT INTO suppression_list (email_hash, reason) VALUES (?, ?)
     ON CONFLICT(email_hash) DO NOTHING`,
    await emailHash(email),
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

export async function isSuppressed(db: D1Database, email: string): Promise<boolean> {
  const row = await first<{ email_hash: string }>(
    db,
    `SELECT email_hash FROM suppression_list WHERE email_hash = ?`,
    await emailHash(email),
  );
  return row !== null;
}

/** Bulk check for imports — returns the subset of addresses that must be skipped. */
export async function filterSuppressed(db: D1Database, emails: string[]): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (!emails.length) return blocked;
  const byHash = new Map<string, string>();
  for (const email of emails) byHash.set(await emailHash(email), normaliseEmail(email));

  const hashes = [...byHash.keys()];
  // Chunked: D1 has a bound-parameter ceiling and an import can be thousands of rows.
  for (let i = 0; i < hashes.length; i += 200) {
    const slice = hashes.slice(i, i + 200);
    const rows = await all<{ email_hash: string }>(
      db,
      `SELECT email_hash FROM suppression_list WHERE email_hash IN (${slice.map(() => "?").join(", ")})`,
      ...slice,
    );
    for (const row of rows) {
      const email = byHash.get(row.email_hash);
      if (email) blocked.add(email);
    }
  }
  return blocked;
}
