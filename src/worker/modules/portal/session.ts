/** Portal sessions: the short-lived identity a freelancer gets from a magic link. */
import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import type { AppContext } from "../../env";
import { randomToken, sha256Hex } from "../../lib/crypto";
import { run } from "../../lib/db";
import { PORTAL_COOKIE, PORTAL_SESSION_HOURS } from "../../middleware/auth";

export async function startPortalSession(c: Context<AppContext>, contactId: string): Promise<void> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + PORTAL_SESSION_HOURS * 3600000);
  await run(
    c.env.DB,
    `INSERT INTO contact_sessions (token_hash, contact_id, expires_at) VALUES (?, ?, ?)`,
    tokenHash,
    contactId,
    expires.toISOString(),
  );
  setCookie(c, PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: c.env.APP_ENV !== "development",
    sameSite: "Lax",
    path: "/",
    maxAge: PORTAL_SESSION_HOURS * 3600,
  });
}

export function endPortalSession(c: Context<AppContext>): void {
  deleteCookie(c, PORTAL_COOKIE, { path: "/" });
}

/** Drop every open portal session for a contact (used on delete / anonymise). */
export async function revokePortalSessions(db: D1Database, contactId: string): Promise<void> {
  await run(db, `DELETE FROM contact_sessions WHERE contact_id = ?`, contactId);
}
