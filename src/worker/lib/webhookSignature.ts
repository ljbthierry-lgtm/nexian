/**
 * Verifying that a webhook really came from Resend.
 *
 * This endpoint is public and it changes contact state — it can mark an address
 * dead and, on a spam complaint, suppress a person permanently. An unverified
 * version would let anyone on the internet silently delete our ability to
 * contact whoever they named. So the signature check is the whole feature; the
 * bounce handling is the easy part.
 *
 * Resend signs with Svix's scheme: HMAC-SHA256 over `id.timestamp.body`, keyed
 * with the secret's base64 payload, presented as a space-separated list of
 * `v1,<base64>` (a list, because secrets can be rotated with an overlap).
 */
import { timingSafeEqual } from "./crypto";

/** Rejects anything older or newer than this, so a captured call cannot be replayed. */
export const REPLAY_TOLERANCE_SECONDS = 300;

export interface SignatureHeaders {
  id: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
}

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_headers" | "bad_timestamp" | "stale" | "no_match" | "bad_secret";
    };

/** Decode the `whsec_`-prefixed secret into raw key bytes. */
export function decodeSecret(secret: string): Uint8Array | null {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  try {
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}

/** The exact bytes Svix signs. Kept separate so tests can sign the same string. */
export function signedPayload(id: string, timestamp: string, body: string): string {
  return `${id}.${timestamp}.${body}`;
}

export async function computeSignature(secretBytes: Uint8Array, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

export async function verifyWebhook(
  headers: SignatureHeaders,
  body: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: "missing_headers" };
  }

  const sentAt = Number.parseInt(headers.timestamp, 10);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: "bad_timestamp" };
  // Guards both directions: an old capture replayed, and a forged future
  // timestamp meant to stay valid indefinitely.
  if (Math.abs(nowSeconds - sentAt) > REPLAY_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale" };
  }

  const secretBytes = decodeSecret(secret);
  if (!secretBytes) return { ok: false, reason: "bad_secret" };

  const expected = await computeSignature(
    secretBytes,
    signedPayload(headers.id, headers.timestamp, body),
  );

  // The header carries every currently valid signature; one match is enough.
  // Compared in constant time, and every candidate is checked rather than
  // short-circuiting, so timing cannot reveal which one nearly matched.
  let matched = false;
  for (const entry of headers.signature.split(" ")) {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) continue;
    if (timingSafeEqual(value, expected)) matched = true;
  }
  return matched ? { ok: true } : { ok: false, reason: "no_match" };
}
