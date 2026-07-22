/**
 * Crypto helpers — password hashing (PBKDF2), random tokens, hashing.
 * NOTE: Cloudflare Workers WebCrypto rejects PBKDF2 iteration counts above 100_000.
 * Do NOT raise PBKDF2_ITERATIONS beyond that limit.
 */

export const PBKDF2_ITERATIONS = 100_000;

const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return toHex(digest);
}

export async function hashPassword(
  password: string,
  saltHex?: string,
): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ?? randomToken(16);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return { hash: toHex(bits), salt };
}

/** Constant-time string comparison (both hex, same length in the happy path). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  saltHex: string,
  expectedHash: string,
): Promise<boolean> {
  const { hash } = await hashPassword(password, saltHex);
  return timingSafeEqual(hash, expectedHash);
}
