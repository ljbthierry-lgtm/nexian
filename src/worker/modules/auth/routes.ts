/** Staff authentication: bootstrap the first admin, sign in, sign out, set a password. */
import { type Context, Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppContext } from "../../env";
import { hashPassword, randomToken, sha256Hex, verifyPassword } from "../../lib/crypto";
import { first, run, uid } from "../../lib/db";
import { badRequest, forbidden, unauthorized } from "../../lib/errors";
import { log } from "../../lib/log";
import { SESSION_COOKIE, SESSION_DAYS, requireAuth } from "../../middleware/auth";
import { consumeActionToken } from "../notifications/tokens";

export const authRoutes = new Hono<AppContext>();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function startSession(c: Context<AppContext>, userId: string) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await run(
    c.env.DB,
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
    tokenHash,
    userId,
    expires.toISOString(),
  );
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: c.env.APP_ENV !== "development",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

/**
 * Create the very first admin. Works only while the users table is empty and
 * only with the SETUP_KEY secret, so the endpoint seals itself after one use.
 */
authRoutes.post("/bootstrap", async (c) => {
  const body = await c.req.json<{
    email?: string;
    name?: string;
    password?: string;
    key?: string;
  }>();
  if (!c.env.SETUP_KEY) throw forbidden("Bootstrap is disabled: SETUP_KEY is not configured");
  if (body.key !== c.env.SETUP_KEY) throw forbidden("Invalid setup key");

  const existing = await first<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM users`);
  if ((existing?.n ?? 0) > 0) throw forbidden("Already initialised — sign in instead");

  const parsed = z
    .object({ email: z.string().email(), name: z.string().min(1), password: z.string().min(10) })
    .parse(body);

  const { hash, salt } = await hashPassword(parsed.password);
  const id = uid();
  await run(
    c.env.DB,
    `INSERT INTO users (id, email, name, role, pw_hash, pw_salt) VALUES (?, ?, ?, 'admin', ?, ?)`,
    id,
    parsed.email.toLowerCase(),
    parsed.name,
    hash,
    salt,
  );
  log.info("auth.bootstrap", { email: parsed.email });
  await startSession(c, id);
  return c.json({ ok: true });
});

authRoutes.post("/login", async (c) => {
  const { email, password } = loginSchema.parse(await c.req.json());
  const user = await first<{ id: string; pw_hash: string | null; pw_salt: string | null }>(
    c.env.DB,
    `SELECT id, pw_hash, pw_salt FROM users WHERE email = ? AND active = 1`,
    email.toLowerCase(),
  );
  // Same message either way: never reveal whether an address exists.
  const generic = unauthorized("Wrong email or password");
  if (!user?.pw_hash || !user.pw_salt) throw generic;
  if (!(await verifyPassword(password, user.pw_salt, user.pw_hash))) throw generic;

  await startSession(c, user.id);
  log.info("auth.login", { user: user.id });
  return c.json({ ok: true });
});

authRoutes.post("/logout", async (c) => {
  const raw = c.req.header("cookie") ?? "";
  const match = /(?:^|;\s*)nx_session=([^;]+)/.exec(raw);
  if (match?.[1]) {
    await run(c.env.DB, `DELETE FROM sessions WHERE token_hash = ?`, await sha256Hex(match[1]));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

/** Whether the app still needs its first admin — drives the login screen. */
authRoutes.get("/state", async (c) => {
  const row = await first<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM users`);
  return c.json({ needsBootstrap: (row?.n ?? 0) === 0 });
});

authRoutes.get("/me", requireAuth(), (c) => c.json(c.get("user")));

/** Finish a staff invitation: exchange a set_password token for a real password. */
authRoutes.post("/set-password", async (c) => {
  const { token, password } = z
    .object({ token: z.string().min(1), password: z.string().min(10) })
    .parse(await c.req.json());

  const row = await consumeActionToken(c.env.DB, token, "set_password");
  if (!row?.user_id) throw badRequest("That link is no longer valid — ask an admin for a new one");

  const { hash, salt } = await hashPassword(password);
  await run(
    c.env.DB,
    `UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?`,
    hash,
    salt,
    row.user_id,
  );
  await startSession(c, row.user_id);
  return c.json({ ok: true });
});

/** Change your own password while signed in. */
authRoutes.post("/change-password", requireAuth(), async (c) => {
  const { current, next } = z
    .object({ current: z.string().min(1), next: z.string().min(10) })
    .parse(await c.req.json());
  const me = c.get("user");
  const row = await first<{ pw_hash: string | null; pw_salt: string | null }>(
    c.env.DB,
    `SELECT pw_hash, pw_salt FROM users WHERE id = ?`,
    me.id,
  );
  if (!row?.pw_hash || !row.pw_salt) throw badRequest("No password set on this account");
  if (!(await verifyPassword(current, row.pw_salt, row.pw_hash))) {
    throw badRequest("Your current password is not correct");
  }
  const { hash, salt } = await hashPassword(next);
  await run(c.env.DB, `UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?`, hash, salt, me.id);
  return c.json({ ok: true });
});
