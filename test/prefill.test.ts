/**
 * The rule that keeps a forwarded invitation link from taking over a record.
 *
 * A join_prefill link travels in email and LinkedIn messages, so holding it is
 * not proof of being the invited person. `canAdoptPrefill` is what stops a link
 * from binding a stranger's submission to — and rewriting — the invited contact.
 */
import { describe, expect, it } from "vitest";
import { canAdoptPrefill } from "../src/worker/lib/prefill";

describe("canAdoptPrefill", () => {
  it("binds when a LinkedIn-only prospect supplies their email for the first time", () => {
    // The normal case: the invited contact has no email yet, so there is nothing
    // to hijack — whatever they type becomes their address, proven later by the
    // verification link.
    expect(
      canAdoptPrefill({
        existingId: null,
        tokenContactId: "c1",
        tokenContactEmail: null,
        submittedEmail: "new@person.test",
      }),
    ).toBe(true);
  });

  it("binds when the submitted email is the invited contact's own on-file address", () => {
    expect(
      canAdoptPrefill({
        existingId: "c1",
        tokenContactId: "c1",
        tokenContactEmail: "known@person.test",
        submittedEmail: "known@person.test",
      }),
    ).toBe(true);
  });

  it("REFUSES to rewrite an invited contact's established email to a new one", () => {
    // The takeover: a link-holder submits their own fresh address for a contact
    // that already has an email. The token must not bind, so the invited record's
    // email, suppression state and profile are left untouched.
    expect(
      canAdoptPrefill({
        existingId: null,
        tokenContactId: "c1",
        tokenContactEmail: "victim@person.test",
        submittedEmail: "attacker@evil.test",
      }),
    ).toBe(false);
  });

  it("REFUSES when the submission already belongs to a different record", () => {
    expect(
      canAdoptPrefill({
        existingId: "someone-else",
        tokenContactId: "c1",
        tokenContactEmail: null,
        submittedEmail: "attacker@evil.test",
      }),
    ).toBe(false);
  });

  it("is case-insensitive on the email match (caller lower-cases both)", () => {
    expect(
      canAdoptPrefill({
        existingId: "c1",
        tokenContactId: "c1",
        tokenContactEmail: "known@person.test",
        submittedEmail: "known@person.test",
      }),
    ).toBe(true);
  });
});
