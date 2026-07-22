/**
 * The security headers, in one place.
 *
 * This lives in its own module rather than in the Worker entry file because the
 * Workers runtime treats every named export of the entry module as a handler and
 * refuses to start when one is a plain value:
 *
 *   Incorrect type for map entry 'CSP': the provided value is not of type
 *   'function or ExportedHandler'
 *
 * `style-src` allows inline styles because React writes `style` attributes and
 * the emailed action pages carry a `<style>` block. Scripts get no such
 * exemption — that is the half that stops injected markup from executing.
 *
 * Statically served assets never reach the Worker, so `src/web/public/_headers`
 * repeats this policy for them. `test/headers.test.ts` asserts the two agree.
 */

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

/** Apply the full set to a response, whether the Worker or the CDN built it. */
export function harden(headers: Headers): void {
  headers.set("Content-Security-Policy", CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}
