/**
 * The security policy is written twice — once in the Worker, once in
 * `_headers` for the statically served SPA shell, because those assets are
 * served from the edge and never reach the Worker. A comment asks whoever edits
 * one to edit the other; this makes that enforceable.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CSP } from "../src/worker/lib/securityHeaders";

const headersFile = readFileSync(
  join(import.meta.dirname, "..", "src", "web", "public", "_headers"),
  "utf8",
);

function headerValue(name: string): string | undefined {
  const line = headersFile.split(/\r?\n/).find((l) => l.trim().startsWith(`${name}:`));
  return line?.split(":").slice(1).join(":").trim();
}

describe("the two copies of the security headers agree", () => {
  it("serves the same Content-Security-Policy from the edge as from the Worker", () => {
    expect(headerValue("Content-Security-Policy")).toBe(CSP);
  });

  it("repeats the other protections for statically served assets", () => {
    expect(headerValue("X-Frame-Options")).toBe("DENY");
    expect(headerValue("X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue("Referrer-Policy")).toBe("same-origin");
    expect(headerValue("Strict-Transport-Security")).toContain("max-age=");
  });
});

describe("the policy itself", () => {
  it("does not allow inline or remote script, which is what stops injected markup running", () => {
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(CSP).not.toMatch(/script-src[^;]*unsafe-eval/);
  });

  it("forbids framing and plugin content, and pins the base URI", () => {
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).toContain("object-src 'none'");
    expect(CSP).toContain("base-uri 'none'");
  });

  it("keeps requests same-origin, so a compromised page cannot exfiltrate", () => {
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).toContain("connect-src 'self'");
    expect(CSP).toContain("form-action 'self'");
  });
});
