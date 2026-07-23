/**
 * Personal bearer tokens for the browser extension.
 *
 * The raw token exists only at the moment of creation — shown once, then only
 * its SHA-256 is kept. A token authenticates as exactly one staff member, so an
 * extension can do only what that person can do, and revoking it is a single row
 * update that takes effect on the next request.
 */
import type { SessionUser } from "../env";
import { randomToken, sha256Hex } from "./crypto";
import { all, first, run } from "./db";

const PREFIX = "nxext_";

export interface ApiTokenRow {
  token_hash: string;
  user_id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Create a token for a user. Returns the raw value — the only time it is visible. */
export async function createApiToken(
  db: D1Database,
  userId: string,
  label: string,
): Promise<{ id: string; raw: string }> {
  const raw = `${PREFIX}${randomToken(32)}`;
  await run(
    db,
    `INSERT INTO api_tokens (token_hash, user_id, label) VALUES (?, ?, ?)`,
    await sha256Hex(raw),
    userId,
    label.slice(0, 80),
  );
  // The hash doubles as the id; the caller only needs it to revoke later, and we
  // return a short prefix of the raw for display ("nxext_1a2b…").
  return { id: await sha256Hex(raw), raw };
}

/**
 * Resolve a bearer token to its staff user, or null. A revoked token, an unknown
 * one, or a disabled account all return null — indistinguishably.
 */
export async function verifyApiToken(
  db: D1Database,
  authorization: string | null | undefined,
): Promise<SessionUser | null> {
  const raw = (authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!raw.startsWith(PREFIX)) return null;

  const hash = await sha256Hex(raw);
  const row = await first<SessionUser & { revoked_at: string | null }>(
    db,
    `SELECT u.id, u.email, u.name, u.role, t.revoked_at
     FROM api_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ? AND u.active = 1`,
    hash,
  );
  if (!row || row.revoked_at) return null;

  // Best-effort last-used stamp, so a stale token is visible in the list. Never
  // blocks the request if it fails.
  await run(
    db,
    `UPDATE api_tokens SET last_used_at = datetime('now') WHERE token_hash = ?`,
    hash,
  ).catch(() => {});
  const { revoked_at: _drop, ...user } = row;
  return user as SessionUser;
}

/** A user's tokens, newest first, without the secret. */
export async function listApiTokens(db: D1Database, userId: string) {
  return all<{
    token_hash: string;
    label: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
  }>(
    db,
    `SELECT token_hash, label, created_at, last_used_at, revoked_at
     FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC`,
    userId,
  );
}

/** Revoke one of the caller's own tokens. Scoped to user_id so nobody revokes another's. */
export async function revokeApiToken(
  db: D1Database,
  userId: string,
  tokenHash: string,
): Promise<boolean> {
  const res = await run(
    db,
    `UPDATE api_tokens SET revoked_at = datetime('now')
     WHERE token_hash = ? AND user_id = ? AND revoked_at IS NULL`,
    tokenHash,
    userId,
  );
  return res.meta.changes > 0;
}
