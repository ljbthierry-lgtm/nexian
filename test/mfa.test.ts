/**
 * The second factor.
 *
 * A six-digit code is only a million possibilities, so what makes it safe is the
 * expiry, the attempt cap and single use — and each of those is a rule that
 * could be quietly broken by a refactor. Hence the coverage.
 */
import { describe, expect, it } from "vitest";
import {
  MFA_MAX_ATTEMPTS,
  challengeExpiry,
  generateCode,
  hashCode,
  mfaActive,
  verdictMessage,
  verifyChallenge,
} from "../src/worker/lib/mfa";

const ID = "challenge-abc";
const FUTURE = new Date(Date.now() + 60_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

async function challengeFor(
  code: string,
  over: Partial<Parameters<typeof verifyChallenge>[1]> = {},
) {
  return {
    code_hash: await hashCode(ID, code),
    attempts: 0,
    expires_at: FUTURE,
    consumed_at: null,
    ...over,
  };
}

describe("whether the second factor runs at all", () => {
  it("is active exactly when outbound email is configured", () => {
    expect(mfaActive({ RESEND_API_KEY: "re_live_key" })).toBe(true);
    expect(mfaActive({ RESEND_API_KEY: undefined })).toBe(false);
    expect(mfaActive({ RESEND_API_KEY: "" })).toBe(false);
  });
});

describe("code generation", () => {
  it("always produces exactly six digits, including when the value is small", () => {
    for (const value of [0, 7, 42, 999_999]) {
      const code = generateCode((a) => {
        a[0] = value;
        return a;
      });
      expect(code).toMatch(/^\d{6}$/);
    }
    expect(
      generateCode((a) => {
        a[0] = 42;
        return a;
      }),
    ).toBe("000042");
  });

  it("rejects values that would bias the code space rather than folding them in", () => {
    // Anything at or above the largest clean multiple of 1e6 must be discarded,
    // otherwise low codes become fractionally likelier than high ones.
    const ceiling = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
    const sequence = [ceiling, ceiling + 5, 123_456];
    let i = 0;
    const code = generateCode((a) => {
      a[0] = sequence[i++]!;
      return a;
    });
    expect(code).toBe("123456");
    expect(i).toBe(3); // the two out-of-range draws were thrown away
  });

  it("produces varied codes across many draws", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateCode()));
    expect(seen.size).toBeGreaterThan(150);
  });
});

describe("verifying a submitted code", () => {
  it("accepts the right code", async () => {
    expect(await verifyChallenge(ID, await challengeFor("123456"), "123456")).toEqual({ ok: true });
  });

  it("tolerates surrounding whitespace from a paste", async () => {
    expect(await verifyChallenge(ID, await challengeFor("123456"), "  123456 ")).toEqual({
      ok: true,
    });
  });

  it("refuses the wrong code and counts the attempt down", async () => {
    const verdict = await verifyChallenge(ID, await challengeFor("123456"), "654321");
    expect(verdict).toEqual({ ok: false, reason: "wrong", attemptsLeft: MFA_MAX_ATTEMPTS - 1 });
  });

  it("refuses an expired challenge before comparing the code", async () => {
    const verdict = await verifyChallenge(
      ID,
      await challengeFor("123456", { expires_at: PAST }),
      "123456",
    );
    expect(verdict).toEqual({ ok: false, reason: "expired", attemptsLeft: 0 });
  });

  it("refuses a challenge that was already used, even with the right code", async () => {
    const verdict = await verifyChallenge(
      ID,
      await challengeFor("123456", { consumed_at: new Date().toISOString() }),
      "123456",
    );
    expect(verdict).toEqual({ ok: false, reason: "consumed", attemptsLeft: 0 });
  });

  it("locks out once the attempt cap is reached, even with the right code", async () => {
    const verdict = await verifyChallenge(
      ID,
      await challengeFor("123456", { attempts: MFA_MAX_ATTEMPTS }),
      "123456",
    );
    expect(verdict).toEqual({ ok: false, reason: "locked", attemptsLeft: 0 });
  });

  it("spends an attempt on malformed input rather than letting it probe for free", async () => {
    for (const junk of ["", "12345", "1234567", "abcdef", "12 34 56"]) {
      const verdict = await verifyChallenge(ID, await challengeFor("123456"), junk);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.attemptsLeft).toBe(MFA_MAX_ATTEMPTS - 1);
    }
  });

  it("binds a code to its own challenge, so one cannot be replayed against another", async () => {
    // Same code, different challenge id: the id salts the hash.
    const stored = await challengeFor("123456");
    expect((await verifyChallenge("a-different-challenge", stored, "123456")).ok).toBe(false);
  });
});

describe("what the user is told", () => {
  it("never reveals how close a guess was", () => {
    const messages = [
      verdictMessage({ ok: false, reason: "wrong", attemptsLeft: 3 }),
      verdictMessage({ ok: false, reason: "expired", attemptsLeft: 0 }),
      verdictMessage({ ok: false, reason: "consumed", attemptsLeft: 0 }),
      verdictMessage({ ok: false, reason: "locked", attemptsLeft: 0 }),
    ];
    for (const m of messages) {
      expect(m).not.toMatch(/digit|close|correct so far/i);
    }
  });

  it("counts down while attempts remain, then stops offering retries", () => {
    expect(verdictMessage({ ok: false, reason: "wrong", attemptsLeft: 3 })).toContain(
      "3 attempts left",
    );
    expect(verdictMessage({ ok: false, reason: "wrong", attemptsLeft: 1 })).toContain(
      "1 attempt left",
    );
    expect(verdictMessage({ ok: false, reason: "wrong", attemptsLeft: 0 })).toContain(
      "Sign in again",
    );
  });
});

describe("expiry window", () => {
  it("is ten minutes ahead", () => {
    const now = new Date("2026-07-22T10:00:00.000Z");
    expect(challengeExpiry(now)).toBe("2026-07-22T10:10:00.000Z");
  });
});
