import { describe, expect, it } from "vitest";
import { decideOutreach } from "../src/worker/modules/outreach/eligibility";

const POLICY = { maxTouches: 2, followUpAfterDays: 10 };
const NOW = new Date("2026-07-22T12:00:00Z");

const base = {
  suppressed: false,
  anonymized: false,
  hasProfile: false,
  outreachCount: 0,
  lastOutreachAt: null as string | null,
};

describe("outreach eligibility", () => {
  it("allows a first invitation to an untouched prospect", () => {
    expect(decideOutreach(base, POLICY, NOW)).toEqual({ allowed: true, kind: "invite" });
  });

  it("never contacts someone who asked not to be", () => {
    const decision = decideOutreach({ ...base, suppressed: true }, POLICY, NOW);
    expect(decision.allowed).toBe(false);
  });

  it("never cold-contacts someone who already registered", () => {
    const decision = decideOutreach({ ...base, hasProfile: true }, POLICY, NOW);
    expect(decision).toMatchObject({ allowed: false });
    if (!decision.allowed) expect(decision.reason).toContain("Already registered");
  });

  it("never contacts an anonymised record", () => {
    expect(decideOutreach({ ...base, anonymized: true }, POLICY, NOW).allowed).toBe(false);
  });

  it("holds the follow-up until the waiting period has passed", () => {
    const decision = decideOutreach(
      { ...base, outreachCount: 1, lastOutreachAt: "2026-07-20T12:00:00Z" },
      POLICY,
      NOW,
    );
    expect(decision).toMatchObject({ allowed: false });
    if (!decision.allowed) expect(decision.reason).toContain("8 days");
  });

  it("sends the follow-up once the waiting period has passed", () => {
    expect(
      decideOutreach(
        { ...base, outreachCount: 1, lastOutreachAt: "2026-07-01T12:00:00Z" },
        POLICY,
        NOW,
      ),
    ).toEqual({ allowed: true, kind: "followup" });
  });

  it("stops for good at the touch limit", () => {
    const decision = decideOutreach(
      { ...base, outreachCount: 2, lastOutreachAt: "2020-01-01T00:00:00Z" },
      POLICY,
      NOW,
    );
    expect(decision).toMatchObject({ allowed: false });
    if (!decision.allowed) expect(decision.reason).toContain("limit reached");
  });

  it("honours a one-touch policy", () => {
    const decision = decideOutreach(
      { ...base, outreachCount: 1, lastOutreachAt: "2020-01-01T00:00:00Z" },
      { maxTouches: 1, followUpAfterDays: 10 },
      NOW,
    );
    expect(decision.allowed).toBe(false);
  });

  it("treats an unreadable timestamp as due rather than blocking forever", () => {
    expect(
      decideOutreach({ ...base, outreachCount: 1, lastOutreachAt: "not-a-date" }, POLICY, NOW),
    ).toEqual({ allowed: true, kind: "followup" });
  });
});
