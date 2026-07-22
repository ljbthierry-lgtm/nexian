/**
 * Single-use action tokens behind email buttons. The raw token lives only in the
 * URL we mail; the database stores its SHA-256, so a leaked backup cannot be
 * replayed against the app.
 *
 * Unsubscribe tokens are the deliberate exception: they stay valid and reusable
 * for a year, because someone digging up an old email to opt out must always
 * succeed. Making that link single-use would trap people in a mailing list.
 */
import { randomToken, sha256Hex } from "../../lib/crypto";
import { first, run } from "../../lib/db";

export type TokenPurpose = "portal_link" | "confirm_availability" | "unsubscribe" | "set_password";

export interface ActionTokenRow {
  token_hash: string;
  purpose: TokenPurpose;
  contact_id: string | null;
  user_id: string | null;
  payload: string;
  single_use: number;
  expires_at: string;
  used_at: string | null;
}

const DEFAULT_TTL_DAYS: Record<TokenPurpose, number> = {
  portal_link: 7,
  confirm_availability: 60,
  unsubscribe: 365,
  set_password: 14,
};

export async function createActionToken(
  db: D1Database,
  opts: {
    purpose: TokenPurpose;
    contactId?: string;
    userId?: string;
    payload?: unknown;
    ttlDays?: number;
  },
): Promise<string> {
  const raw = randomToken(32);
  const hash = await sha256Hex(raw);
  const ttl = opts.ttlDays ?? DEFAULT_TTL_DAYS[opts.purpose];
  const expires = new Date(Date.now() + ttl * 86400000).toISOString();
  await run(
    db,
    `INSERT INTO action_tokens (token_hash, purpose, contact_id, user_id, payload, single_use, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    hash,
    opts.purpose,
    opts.contactId ?? null,
    opts.userId ?? null,
    JSON.stringify(opts.payload ?? {}),
    opts.purpose === "unsubscribe" ? 0 : 1,
    expires,
  );
  return raw;
}

/** Look up a token without consuming it (used to render the landing page). */
export async function peekActionToken(
  db: D1Database,
  rawToken: string,
): Promise<ActionTokenRow | null> {
  if (!/^[0-9a-f]{64}$/.test(rawToken)) return null;
  const hash = await sha256Hex(rawToken);
  const row = await first<ActionTokenRow>(
    db,
    `SELECT * FROM action_tokens WHERE token_hash = ?`,
    hash,
  );
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) return null;
  if (row.single_use === 1 && row.used_at) return null;
  return row;
}

/**
 * Consume a token. Reusable tokens (unsubscribe) validate but are not burned, so
 * the same link keeps working. Returns null if invalid, expired, already used, or
 * for a different purpose than the caller expects.
 */
export async function consumeActionToken(
  db: D1Database,
  rawToken: string,
  expectedPurpose: TokenPurpose,
): Promise<ActionTokenRow | null> {
  const row = await peekActionToken(db, rawToken);
  if (!row || row.purpose !== expectedPurpose) return null;
  if (row.single_use === 0) return row;
  const res = await run(
    db,
    `UPDATE action_tokens SET used_at = datetime('now') WHERE token_hash = ? AND used_at IS NULL`,
    row.token_hash,
  );
  if (!res.meta.changes) return null; // raced — someone else consumed it first
  return row;
}

/** Invalidate outstanding links of one kind, e.g. after a profile is deleted. */
export async function revokeTokens(
  db: D1Database,
  contactId: string,
  purpose?: TokenPurpose,
): Promise<void> {
  if (purpose) {
    await run(
      db,
      `DELETE FROM action_tokens WHERE contact_id = ? AND purpose = ?`,
      contactId,
      purpose,
    );
  } else {
    await run(db, `DELETE FROM action_tokens WHERE contact_id = ?`, contactId);
  }
}
