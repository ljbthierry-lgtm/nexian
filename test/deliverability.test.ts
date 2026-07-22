/**
 * What a delivery event means for the person behind the address.
 *
 * The distinction under test is the one that matters legally and practically:
 * a dead mailbox is a fact, a spam complaint is a decision. Only the second one
 * may reach the permanent suppression list.
 */
import { describe, expect, it } from "vitest";
import {
  classifyDeliveryEvent,
  isEmailable,
  isPermanentBounce,
} from "../src/worker/lib/deliverability";

describe("a hard bounce stops email but is never treated as consent", () => {
  const verdict = classifyDeliveryEvent("email.bounced", "Permanent", "mailbox does not exist");

  it("marks the address unusable and stops sending", () => {
    expect(verdict.contactStatus).toBe("bounced");
    expect(verdict.stopEmailing).toBe(true);
    expect(verdict.bounceKind).toBe("permanent");
  });

  it("NEVER suppresses — the person did not choose anything", () => {
    // Suppression is permanent and survives deletion. Applying it to a typo in
    // an address would lock a willing freelancer out for good.
    expect(verdict.suppress).toBe(false);
  });

  it("says so in the activity trail", () => {
    expect(verdict.activity).toContain("rejected permanently");
  });
});

describe("a soft bounce changes nothing", () => {
  it("does not stop sending on a temporary failure", () => {
    const verdict = classifyDeliveryEvent("email.bounced", "Transient", "mailbox full");
    expect(verdict.stopEmailing).toBe(false);
    expect(verdict.contactStatus).toBeNull();
    expect(verdict.bounceKind).toBe("transient");
  });

  it("treats an unrecognised bounce type as temporary, not permanent", () => {
    // Over-reacting silently shrinks the list; under-reacting costs one retry.
    for (const type of ["Undetermined", "", null, undefined, "weird-new-value"]) {
      expect(classifyDeliveryEvent("email.bounced", type).stopEmailing).toBe(false);
    }
  });

  it("recognises the spellings providers actually use for permanent", () => {
    expect(isPermanentBounce("Permanent")).toBe(true);
    expect(isPermanentBounce("permanent")).toBe(true);
    expect(isPermanentBounce("HardBounce")).toBe(true);
    expect(isPermanentBounce("Transient")).toBe(false);
  });
});

describe("a spam complaint is a decision, and gets the full treatment", () => {
  const verdict = classifyDeliveryEvent("email.complained");

  it("suppresses permanently and stops all email", () => {
    expect(verdict.suppress).toBe(true);
    expect(verdict.stopEmailing).toBe(true);
    expect(verdict.contactStatus).toBe("complained");
  });
});

describe("other events", () => {
  it("records a delivery", () => {
    expect(classifyDeliveryEvent("email.delivered").contactStatus).toBe("delivered");
  });

  it("ignores opens and clicks rather than storing behavioural data", () => {
    for (const type of ["email.opened", "email.clicked", "email.sent"]) {
      const v = classifyDeliveryEvent(type);
      expect(v).toMatchObject({ contactStatus: null, stopEmailing: false, suppress: false });
    }
  });

  it("shrugs at an event type it has never seen", () => {
    expect(classifyDeliveryEvent("email.teleported").stopEmailing).toBe(false);
  });
});

describe("who may still be emailed", () => {
  it.each([
    [{ email: "a@b.test", email_status: "unknown" }, true],
    [{ email: "a@b.test", email_status: "delivered" }, true],
    [{ email: "a@b.test", email_status: "bounced" }, false],
    [{ email: "a@b.test", email_status: "complained" }, false],
    [{ email: null, email_status: "unknown" }, false],
  ])("isEmailable(%o) -> %s", (row, expected) => {
    expect(isEmailable(row)).toBe(expected);
  });
});
