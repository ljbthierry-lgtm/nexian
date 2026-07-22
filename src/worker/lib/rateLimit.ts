/**
 * Fixed-window rate limiting on top of D1.
 *
 * The endpoints that need it are all public: sign-in (password guessing),
 * registration (junk profiles) and the magic-link request. That last one matters
 * most — without a limit, anyone can point it at a third party's address and
 * make us send them mail repeatedly, which is both abuse of the victim and a
 * fast way to get our sending domain blocklisted.
 *
 * Fixed windows rather than a sliding log: one row and one statement per check,
 * which is what we want on a per-request path. The trade-off is that a burst can
 * straddle a boundary and briefly allow up to double the limit — harmless at
 * these thresholds.
 */
import { first, run } from "./db";
import { log } from "./log";

export interface RateLimitRule {
  /** What is being limited, e.g. "login". Namespaces the key. */
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  /** Password attempts, per IP and per account. */
  login: { bucket: "login", limit: 10, windowSeconds: 900 },
  /** New registrations from one address. */
  register: { bucket: "register", limit: 5, windowSeconds: 3600 },
  /** Magic links, counted per target email — this is the anti-bombing limit. */
  linkPerEmail: { bucket: "link_email", limit: 3, windowSeconds: 3600 },
  /** …and per source IP, so one client cannot spray many addresses. */
  linkPerIp: { bucket: "link_ip", limit: 12, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Key for one counter. Exported for tests: the window arithmetic is the part
 * that decides whether a limit actually resets.
 */
export function rateLimitKey(rule: RateLimitRule, identifier: string, now: Date): string {
  const window = Math.floor(now.getTime() / 1000 / rule.windowSeconds);
  return `${rule.bucket}:${identifier.toLowerCase()}:${window}`;
}

export function windowExpiry(rule: RateLimitRule, now: Date): string {
  const window = Math.floor(now.getTime() / 1000 / rule.windowSeconds);
  return new Date((window + 1) * rule.windowSeconds * 1000).toISOString();
}

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts used inside the current window, including this one. */
  used: number;
  retryAfterSeconds: number;
}

/**
 * Count one attempt and say whether it is allowed.
 *
 * Fails OPEN: if the counter table misbehaves we let the request through rather
 * than lock every user out of signing in. The alternative — failing closed on an
 * infrastructure wobble — is a worse outage than the abuse it would prevent.
 */
export async function hitRateLimit(
  db: D1Database,
  rule: RateLimitRule,
  identifier: string,
  now = new Date(),
): Promise<RateLimitResult> {
  const key = rateLimitKey(rule, identifier, now);
  const expires = windowExpiry(rule, now);
  try {
    const row = await first<{ count: number }>(
      db,
      `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1
       RETURNING count`,
      key,
      expires,
    );
    const used = row?.count ?? 1;
    return {
      allowed: used <= rule.limit,
      used,
      retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(expires) - now.getTime()) / 1000)),
    };
  } catch (e) {
    log.error("ratelimit.failed_open", {
      bucket: rule.bucket,
      error: e instanceof Error ? e.message : String(e),
    });
    return { allowed: true, used: 0, retryAfterSeconds: 0 };
  }
}

/** Drop spent counters. Called from the nightly cron so the table stays small. */
export async function pruneRateLimits(db: D1Database, now = new Date()): Promise<void> {
  await run(db, `DELETE FROM rate_limits WHERE expires_at < ?`, now.toISOString());
}

/** The caller's IP, or a constant so a missing header cannot bypass the limit. */
export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for") ?? "unknown";
}
