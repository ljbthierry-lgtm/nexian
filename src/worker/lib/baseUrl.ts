/**
 * Absolute base URL for links inside emails (registration invites, magic links,
 * availability reminders, unsubscribe).
 *
 * Resolution order:
 *   1. BASE_URL from the environment, when it is a real configured value
 *      (a custom domain set in wrangler.toml always wins);
 *   2. the origin of the last incoming request, remembered in `settings`
 *      — this makes a fresh deployment work on its *.workers.dev URL with no config;
 *   3. BASE_URL as-is (last resort).
 *
 * Without this, a first deploy sends emails whose buttons point at example.com.
 */
import type { Env } from "../env";
import { first, run } from "./db";
import { log } from "./log";

const SETTINGS_KEY = "base_url";

/** Placeholder values that must never end up in a customer-facing email link. */
export function isPlaceholderUrl(url: string | undefined): boolean {
  if (!url) return true;
  return /example\.com|REPLACE|localhost|127\.0\.0\.1/i.test(url);
}

/**
 * Only Cloudflare's own deployment hostnames may be auto-learned.
 *
 * SECURITY: a request URL reflects the client-supplied Host header, so learning
 * any origin would let an attacker poison the links we email to freelancers.
 * Custom domains must therefore be configured explicitly via BASE_URL.
 */
export function isLearnableOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && /\.workers\.dev$/i.test(url.hostname);
  } catch {
    return false;
  }
}

/** Remember the origin serving this request, so scheduled jobs can build links too. */
export async function rememberOrigin(env: Env, requestUrl: string): Promise<void> {
  if (!isPlaceholderUrl(env.BASE_URL)) return; // explicit config wins; nothing to learn
  let origin: string;
  try {
    origin = new URL(requestUrl).origin;
  } catch {
    return;
  }
  if (!isLearnableOrigin(origin)) return;
  const existing = await first<{ value: string }>(
    env.DB,
    `SELECT value FROM settings WHERE key = ?`,
    SETTINGS_KEY,
  );
  if (existing?.value === origin) return;
  await run(
    env.DB,
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    SETTINGS_KEY,
    origin,
  );
  log.info("baseurl.learned", { origin });
}

export async function resolveBaseUrl(env: Env): Promise<string> {
  if (!isPlaceholderUrl(env.BASE_URL)) return env.BASE_URL.replace(/\/$/, "");
  const stored = await first<{ value: string }>(
    env.DB,
    `SELECT value FROM settings WHERE key = ?`,
    SETTINGS_KEY,
  );
  if (stored?.value) return stored.value.replace(/\/$/, "");
  // In local dev the configured localhost URL is the correct value — no warning.
  if (env.APP_ENV !== "development") {
    log.warn("baseurl.unresolved", { configured: env.BASE_URL });
  }
  return (env.BASE_URL ?? "").replace(/\/$/, "");
}
