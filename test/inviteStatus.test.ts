/**
 * The invitation funnel status — one derivation used by every screen, so its
 * precedence rules are the single place a person's standing is decided.
 */
import { describe, expect, it } from "vitest";
import { deriveInviteStatus } from "../src/worker/lib/inviteStatus";

const base = {
  hasEmail: true,
  hasLinkedin: true,
  hasProfile: false,
  suppressed: false,
  anonymized: false,
  outreachCount: 0,
  linkedinState: "none" as const,
};

describe("outcomes outrank process", () => {
  it("registered wins over everything, including touches and queue state", () => {
    expect(
      deriveInviteStatus({ ...base, hasProfile: true, outreachCount: 2, linkedinState: "queued" })
        .key,
    ).toBe("registered");
  });

  it("declined wins over touches — a suppressed person is not 'awaiting reply'", () => {
    expect(deriveInviteStatus({ ...base, suppressed: true, outreachCount: 2 }).key).toBe(
      "declined",
    );
  });

  it("an anonymised record reads as declined, never as invitable", () => {
    expect(deriveInviteStatus({ ...base, anonymized: true }).key).toBe("declined");
  });

  it("but a registered freelancer who later opted out of email still shows registered", () => {
    // Suppression stops OUTREACH; it does not eject someone from the pool.
    expect(deriveInviteStatus({ ...base, hasProfile: true, suppressed: true }).key).toBe(
      "registered",
    );
  });
});

describe("the invitation ladder", () => {
  it("counts touches", () => {
    expect(deriveInviteStatus({ ...base, outreachCount: 1 }).key).toBe("invited_1");
    expect(deriveInviteStatus({ ...base, outreachCount: 2 }).key).toBe("invited_2");
    expect(deriveInviteStatus({ ...base, outreachCount: 3 }).key).toBe("invited_2");
  });

  it("shows the LinkedIn queue only before any touch", () => {
    expect(deriveInviteStatus({ ...base, linkedinState: "queued" }).key).toBe("queued_linkedin");
    expect(deriveInviteStatus({ ...base, linkedinState: "queued", outreachCount: 1 }).key).toBe(
      "invited_1",
    );
  });

  it("starts everyone reachable at 'not invited yet'", () => {
    expect(deriveInviteStatus(base).key).toBe("not_invited");
    expect(deriveInviteStatus({ ...base, hasEmail: false }).key).toBe("not_invited");
    expect(deriveInviteStatus({ ...base, hasLinkedin: false }).key).toBe("not_invited");
  });

  it("flags the unreachable instead of pretending they are waiting", () => {
    expect(deriveInviteStatus({ ...base, hasEmail: false, hasLinkedin: false }).key).toBe(
      "no_channel",
    );
  });
});

it("every status carries a human label and a tone", () => {
  for (const outreachCount of [0, 1, 2]) {
    const status = deriveInviteStatus({ ...base, outreachCount });
    expect(status.label.length).toBeGreaterThan(3);
    expect(["good", "warn", "neutral", "bad"]).toContain(status.tone);
  }
});
