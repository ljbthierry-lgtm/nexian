/** Staff authentication: bootstrap the first admin, sign in, sign out, set a password. */
import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppContext } from "../../env";
import {
  hashPassword,
  randomToken,
  sha256Hex,
  timingSafeEqual,
  verifyPassword,
} from "../../lib/crypto";
import { resolveBaseUrl } from "../../lib/baseUrl";
import { first, run, uid } from "../../lib/db";
import { badRequest, forbidden, tooManyRequests, unauthorized } from "../../lib/errors";
import { log } from "../../lib/log";
import {
  type ChallengeState,
  MFA_CODE_TTL_MINUTES,
  challengeExpiry,
  generateCode,
  hashCode,
  mfaActive,
  verdictMessage,
  verifyChallenge,
} from "../../lib/mfa";
import { RATE_LIMITS, clientIp, hitRateLimit } from "../../lib/rateLimit";
import { SESSION_COOKIE, SESSION_DAYS, requireAuth } from "../../middleware/auth";
import { sendEmail } from "../notifications/resend";
import { signInCodeEmail } from "../notifications/templates";
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

  // Open to the internet for as long as the app has no users, and one correct
  // guess creates an administrator. Throttle it like a login, and compare in
  // constant time so the key cannot be recovered a character at a time.
  const ip = clientIp(c.req.raw.headers);
  const check = await hitRateLimit(c.env.DB, RATE_LIMITS.login, `bootstrap:${ip}`);
  if (!check.allowed) throw tooManyRequests("Too many attempts. Please wait and try again.");
  if (!timingSafeEqual(body.key ?? "", c.env.SETUP_KEY)) throw forbidden("Invalid setup key");

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
  log.info("auth.bootstrap", { user: id });
  await startSession(c, id);
  return c.json({ ok: true });
});

authRoutes.post("/login", async (c) => {
  const { email, password } = loginSchema.parse(await c.req.json());

  // Counted per source IP and per account, so neither one client hammering the
  // form nor many clients targeting one inbox gets unlimited guesses.
  const ip = clientIp(c.req.raw.headers);
  for (const identifier of [`ip:${ip}`, `email:${email.toLowerCase()}`]) {
    const check = await hitRateLimit(c.env.DB, RATE_LIMITS.login, identifier);
    if (!check.allowed) {
      log.warn("auth.rate_limited", { identifier: identifier.split(":")[0], ip });
      throw tooManyRequests(
        `Too many sign-in attempts. Please wait ${Math.ceil(check.retryAfterSeconds / 60)} minutes and try again.`,
      );
    }
  }

  const user = await first<{
    id: string;
    name: string;
    email: string;
    pw_hash: string | null;
    pw_salt: string | null;
  }>(
    c.env.DB,
    `SELECT id, name, email, pw_hash, pw_salt FROM users WHERE email = ? AND active = 1`,
    email.toLowerCase(),
  );
  // Same message either way: never reveal whether an address exists.
  const generic = unauthorized("Wrong email or password");
  if (!user?.pw_hash || !user.pw_salt) throw generic;
  if (!(await verifyPassword(password, user.pw_salt, user.pw_hash))) throw generic;

  // The password alone is no longer a session — it is permission to be sent a
  // code. Where email cannot send, there is nothing to send, so we say so rather
  // than lock the account out of its own application.
  if (mfaActive(c.env)) {
    const challengeId = await issueChallenge(c, user);
    log.info("auth.mfa_challenged", { user: user.id });
    return c.json({ ok: true, mfaRequired: true, challengeId });
  }

  await startSession(c, user.id);
  log.warn("auth.login_without_second_factor", { user: user.id, reason: "email_not_configured" });
  return c.json({ ok: true, mfaRequired: false, mfaActive: false });
});

/**
 * Create a challenge and email the code.
 *
 * The challenge id returned to the browser is a random token that names the
 * challenge, never the user: the second step looks the account up from it
 * server-side, so a caller cannot point a code they were sent at somebody
 * else's account.
 */
async function issueChallenge(
  c: Context<AppContext>,
  user: { id: string; name: string; email: string },
): Promise<string> {
  const challengeId = randomToken(24);
  const code = generateCode();
  const baseUrl = await resolveBaseUrl(c.env);

  await run(
    c.env.DB,
    `INSERT INTO login_challenges (id, user_id, code_hash, expires_at, ip) VALUES (?, ?, ?, ?, ?)`,
    challengeId,
    user.id,
    await hashCode(challengeId, code),
    challengeExpiry(),
    clientIp(c.req.raw.headers),
  );

  const mail = signInCodeEmail(
    { companyName: c.env.COMPANY_NAME, baseUrl },
    { name: user.name, code, minutes: MFA_CODE_TTL_MINUTES },
  );
  await sendEmail(c.env, {
    to: user.email,
    subject: mail.subject,
    html: mail.html,
    template: "sign_in_code",
  });
  return challengeId;
}

/** Second step: exchange a challenge and its code for a session. */
authRoutes.post("/verify-code", async (c) => {
  const { challengeId, code } = z
    .object({ challengeId: z.string().min(1).max(100), code: z.string().min(1).max(20) })
    .parse(await c.req.json());

  // Throttled on its own, so a stolen password plus unlimited guessing at the
  // code is not a way in even across many challenges.
  const ip = clientIp(c.req.raw.headers);
  const check = await hitRateLimit(c.env.DB, RATE_LIMITS.login, `mfa:${ip}`);
  if (!check.allowed) {
    throw tooManyRequests(
      `Too many attempts. Please wait ${Math.ceil(check.retryAfterSeconds / 60)} minutes and try again.`,
    );
  }

  const challenge = await first<ChallengeState & { user_id: string }>(
    c.env.DB,
    `SELECT user_id, code_hash, attempts, expires_at, consumed_at FROM login_challenges WHERE id = ?`,
    challengeId,
  );
  // An unknown challenge id is indistinguishable from an expired one on purpose.
  if (!challenge) throw unauthorized("That code has expired. Sign in again to get a new one.");

  const verdict = await verifyChallenge(challengeId, challenge, code);
  if (!verdict.ok) {
    await run(
      c.env.DB,
      `UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?`,
      challengeId,
    );
    log.warn("auth.mfa_failed", { user: challenge.user_id, reason: verdict.reason });
    throw unauthorized(verdictMessage(verdict));
  }

  // Spend the challenge before issuing the session, and only if it was still
  // unspent — two tabs submitting the same code must not yield two sessions.
  const spend = await run(
    c.env.DB,
    `UPDATE login_challenges SET consumed_at = datetime('now') WHERE id = ? AND consumed_at IS NULL`,
    challengeId,
  );
  if (!spend.meta.changes) {
    throw unauthorized("That code has already been used. Sign in again to get a new one.");
  }

  await startSession(c, challenge.user_id);
  log.info("auth.login", { user: challenge.user_id, secondFactor: true });
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

/**
 * Whether the app still needs its first admin, and whether the second factor is
 * live. The second flag is public on purpose: a protection that is off should be
 * visible on the sign-in page, not buried in a setting nobody opens.
 */
authRoutes.get("/state", async (c) => {
  const row = await first<{ n: number }>(c.env.DB, `SELECT COUNT(*) AS n FROM users`);
  return c.json({
    needsBootstrap: (row?.n ?? 0) === 0,
    mfaActive: mfaActive(c.env),
  });
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

  // Changing a password is what someone does after losing a laptop, so every
  // other session for this account has to stop working — keeping only the one
  // making the request, which would otherwise be signed out mid-action.
  const activeToken = getCookie(c, SESSION_COOKIE);
  await run(
    c.env.DB,
    `DELETE FROM sessions WHERE user_id = ? AND token_hash != ?`,
    me.id,
    activeToken ? await sha256Hex(activeToken) : "",
  );
  log.info("auth.password_changed", { user: me.id });
  return c.json({ ok: true });
});
