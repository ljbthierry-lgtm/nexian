/**
 * Second factor for staff sign-in: a six-digit code emailed to the account's own
 * inbox.
 *
 * Six digits is only a million possibilities, so the code itself is not the
 * defence — the expiry, the attempt cap and single use are. A challenge dies on
 * the first of those to be exceeded, which keeps the number of guesses an
 * attacker gets per stolen password in the single digits.
 *
 * Everything decidable without a database lives here, so the rules can be tested
 * exhaustively rather than inferred from the route.
 */
import type { Env } from "../env";
import { sha256Hex, timingSafeEqual } from "./crypto";

export const MFA_CODE_TTL_MINUTES = 10;
export const MFA_MAX_ATTEMPTS = 5;
export const MFA_CODE_LENGTH = 6;

/**
 * Whether the second factor can actually run.
 *
 * It is active exactly when outbound email is configured. The alternative —
 * requiring a code that cannot be delivered — would lock every account out of
 * the application permanently, including the first administrator, who does not
 * exist yet. So this degrades visibly instead: sign-in falls back to a password,
 * and the interface says plainly that the second factor is inactive and why.
 * Setting RESEND_API_KEY turns it on for everyone with no further deployment.
 */
export function mfaActive(env: Pick<Env, "RESEND_API_KEY">): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/**
 * A uniformly distributed six-digit code.
 *
 * Rejection sampling rather than a modulo: `random % 1000000` would make the
 * lower codes fractionally more likely, and a biased code space is a smaller
 * code space.
 */
export function generateCode(
  randomValues: (array: Uint32Array) => Uint32Array = (a) => crypto.getRandomValues(a),
): string {
  const limit = 1_000_000;
  // Largest multiple of `limit` inside a uint32; anything above it is discarded.
  const ceiling = Math.floor(0xffffffff / limit) * limit;
  const buf = new Uint32Array(1);
  let value = 0;
  do {
    value = randomValues(buf)[0]!;
  } while (value >= ceiling);
  return String(value % limit).padStart(MFA_CODE_LENGTH, "0");
}

/** Hash a code for storage. The challenge id is random, so it doubles as the salt. */
export function hashCode(challengeId: string, code: string): Promise<string> {
  return sha256Hex(`${challengeId}:${code}`);
}

export interface ChallengeState {
  code_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
}

export type MfaVerdict =
  | { ok: true }
  | { ok: false; reason: "expired" | "consumed" | "locked" | "wrong"; attemptsLeft: number };

/**
 * Decide a submitted code against a stored challenge.
 *
 * Order matters: a challenge that is expired, spent or locked is refused before
 * the code is even compared, so a stale challenge cannot be ground down by
 * repeated guesses.
 */
export async function verifyChallenge(
  challengeId: string,
  challenge: ChallengeState,
  submittedCode: string,
  now = new Date(),
): Promise<MfaVerdict> {
  if (challenge.consumed_at) return { ok: false, reason: "consumed", attemptsLeft: 0 };
  if (challenge.expires_at < now.toISOString()) {
    return { ok: false, reason: "expired", attemptsLeft: 0 };
  }
  if (challenge.attempts >= MFA_MAX_ATTEMPTS) {
    return { ok: false, reason: "locked", attemptsLeft: 0 };
  }

  const submitted = submittedCode.trim();
  const attemptsLeft = MFA_MAX_ATTEMPTS - challenge.attempts - 1;
  // Shape-check before hashing so obvious noise costs no work, but still spend
  // an attempt: a malformed guess is a guess.
  if (!new RegExp(`^\\d{${MFA_CODE_LENGTH}}$`).test(submitted)) {
    return { ok: false, reason: "wrong", attemptsLeft };
  }

  const expected = await hashCode(challengeId, submitted);
  if (!timingSafeEqual(expected, challenge.code_hash)) {
    return { ok: false, reason: "wrong", attemptsLeft };
  }
  return { ok: true };
}

/** Wording for each refusal. Never says whether the code was close or the account exists. */
export function verdictMessage(verdict: Extract<MfaVerdict, { ok: false }>): string {
  switch (verdict.reason) {
    case "expired":
      return "That code has expired. Sign in again to get a new one.";
    case "consumed":
      return "That code has already been used. Sign in again to get a new one.";
    case "locked":
      return "Too many incorrect codes. Sign in again to get a new one.";
    case "wrong":
      return verdict.attemptsLeft > 0
        ? `That code is not correct. ${verdict.attemptsLeft} attempt${verdict.attemptsLeft === 1 ? "" : "s"} left.`
        : "Too many incorrect codes. Sign in again to get a new one.";
  }
}

export function challengeExpiry(now = new Date()): string {
  return new Date(now.getTime() + MFA_CODE_TTL_MINUTES * 60000).toISOString();
}
