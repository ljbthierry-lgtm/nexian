/**
 * Two separate identities, two separate cookies.
 *
 * Staff sign in with a password and get `nx_session`. Freelancers follow a magic
 * link from an email and get `nx_portal`. Keeping them apart means a portal
 * cookie can never satisfy a back-office route, whatever a caller sends.
 */
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { AppContext, PortalContact, Role, SessionUser } from "../env";
import { sha256Hex } from "../lib/crypto";
import { first, run } from "../lib/db";
import { forbidden, unauthorized } from "../lib/errors";

export const SESSION_COOKIE = "nx_session";
export const PORTAL_COOKIE = "nx_portal";
export const SESSION_DAYS = 30;
/** Portal sessions are short: the link is emailed, so it is only as safe as the inbox. */
export const PORTAL_SESSION_HOURS = 12;

/** Staff session, or 401. */
export function requireAuth() {
  return async (c: Context<AppContext>, next: Next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) throw unauthorized();
    const tokenHash = await sha256Hex(token);
    const row = await first<SessionUser & { expires_at: string }>(
      c.env.DB,
      `SELECT u.id, u.email, u.name, u.role, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND u.active = 1`,
      tokenHash,
    );
    if (!row) throw unauthorized("Session expired — please sign in again");
    if (row.expires_at < new Date().toISOString()) {
      await run(c.env.DB, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash);
      throw unauthorized("Session expired — please sign in again");
    }
    const { expires_at: _drop, ...user } = row;
    c.set("user", user as SessionUser);
    await next();
  };
}

/** Role gate — every protected group states who may enter. */
export function requireRole(...roles: Role[]) {
  return async (c: Context<AppContext>, next: Next) => {
    const user = c.get("user");
    if (!user) throw unauthorized();
    if (!roles.includes(user.role)) throw forbidden();
    await next();
  };
}

/** Freelancer portal session, or 401. */
export function requirePortal() {
  return async (c: Context<AppContext>, next: Next) => {
    const token = getCookie(c, PORTAL_COOKIE);
    if (!token) throw unauthorized("Your sign-in link has expired — request a new one");
    const tokenHash = await sha256Hex(token);
    const row = await first<PortalContact & { expires_at: string }>(
      c.env.DB,
      `SELECT ct.id, ct.email, ct.first_name, ct.last_name, cs.expires_at
       FROM contact_sessions cs JOIN contacts ct ON ct.id = cs.contact_id
       WHERE cs.token_hash = ? AND ct.anonymized_at IS NULL`,
      tokenHash,
    );
    if (!row) throw unauthorized("Your sign-in link has expired — request a new one");
    if (row.expires_at < new Date().toISOString()) {
      await run(c.env.DB, `DELETE FROM contact_sessions WHERE token_hash = ?`, tokenHash);
      throw unauthorized("Your sign-in link has expired — request a new one");
    }
    const { expires_at: _drop, ...contact } = row;
    c.set("contact", contact as PortalContact);
    await next();
  };
}
