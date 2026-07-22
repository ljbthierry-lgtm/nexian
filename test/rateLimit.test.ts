import { describe, expect, it } from "vitest";
import { RATE_LIMITS, clientIp, rateLimitKey, windowExpiry } from "../src/worker/lib/rateLimit";

const RULE = { bucket: "login", limit: 10, windowSeconds: 900 };

describe("rate limit windows", () => {
  it("keeps two calls in the same window on the same counter", () => {
    const a = rateLimitKey(RULE, "ip:1.2.3.4", new Date("2026-07-22T10:00:00Z"));
    const b = rateLimitKey(RULE, "ip:1.2.3.4", new Date("2026-07-22T10:14:59Z"));
    expect(a).toBe(b);
  });

  it("moves to a new counter once the window rolls over", () => {
    const a = rateLimitKey(RULE, "ip:1.2.3.4", new Date("2026-07-22T10:00:00Z"));
    const b = rateLimitKey(RULE, "ip:1.2.3.4", new Date("2026-07-22T10:15:01Z"));
    expect(a).not.toBe(b);
  });

  it("counts different identifiers separately", () => {
    const now = new Date("2026-07-22T10:00:00Z");
    expect(rateLimitKey(RULE, "ip:1.2.3.4", now)).not.toBe(rateLimitKey(RULE, "ip:5.6.7.8", now));
  });

  it("counts different buckets separately, so one limit cannot exhaust another", () => {
    const now = new Date("2026-07-22T10:00:00Z");
    expect(rateLimitKey(RATE_LIMITS.login, "x", now)).not.toBe(
      rateLimitKey(RATE_LIMITS.register, "x", now),
    );
  });

  it("treats an address case-insensitively, so capitalising it is not a bypass", () => {
    const now = new Date("2026-07-22T10:00:00Z");
    expect(rateLimitKey(RULE, "email:Jane@Example.com", now)).toBe(
      rateLimitKey(RULE, "email:jane@example.com", now),
    );
  });

  it("expires at the end of the window, never in the past", () => {
    const now = new Date("2026-07-22T10:07:30Z");
    const expiry = Date.parse(windowExpiry(RULE, now));
    expect(expiry).toBeGreaterThan(now.getTime());
    expect(expiry - now.getTime()).toBeLessThanOrEqual(RULE.windowSeconds * 1000);
  });
});

describe("client identification", () => {
  it("prefers Cloudflare's connecting IP", () => {
    const headers = new Headers({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" });
    expect(clientIp(headers)).toBe("1.2.3.4");
  });

  it("falls back to a constant rather than letting a missing header skip the limit", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("configured limits", () => {
  it("limits magic links per target address — the anti-bombing rule", () => {
    expect(RATE_LIMITS.linkPerEmail.limit).toBeLessThanOrEqual(5);
    expect(RATE_LIMITS.linkPerEmail.windowSeconds).toBeGreaterThanOrEqual(3600);
  });

  it("keeps sign-in attempts low enough to make guessing useless", () => {
    expect(RATE_LIMITS.login.limit).toBeLessThanOrEqual(10);
  });
});
