/**
 * Reply classification and export alerting.
 *
 * The reply half guards one specific mistake: an out-of-office auto-responder
 * looks exactly like a reply, and treating one as an answer would silently
 * cancel the follow-up to somebody who is merely on holiday — a prospect lost
 * in a way nobody would ever notice, because the record would read "replied".
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_EXPORT_THRESHOLDS, assessExport } from "../src/worker/lib/alerts";
import { classifyIncoming, isAutomatedReply, senderAddress } from "../src/worker/lib/replyMatch";

const headersOf = (h: Record<string, string> = {}) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
});

describe("finding the sender", () => {
  it.each([
    ["Sofie Vermeulen <sofie@example.test>", "sofie@example.test"],
    ["sofie@example.test", "sofie@example.test"],
    ["  <SOFIE@EXAMPLE.TEST>  ", "sofie@example.test"],
    ['"Vermeulen, Sofie" <sofie@example.test>', "sofie@example.test"],
  ])("reads %s", (input, expected) => {
    expect(senderAddress(input)).toBe(expected);
  });

  it("returns null for anything unusable", () => {
    for (const bad of ["", "   ", "not an address", "<>", null, undefined]) {
      expect(senderAddress(bad)).toBeNull();
    }
  });
});

describe("an automatic reply is not an answer", () => {
  it("catches the RFC 3834 header", () => {
    expect(isAutomatedReply(headersOf({ "auto-submitted": "auto-replied" }))).toBe(true);
    // "no" is the explicit marker for a human-sent message.
    expect(isAutomatedReply(headersOf({ "auto-submitted": "no" }))).toBe(false);
  });

  it("catches the common precedence values", () => {
    for (const v of ["bulk", "auto_reply", "list", "junk"]) {
      expect(isAutomatedReply(headersOf({ precedence: v })), v).toBe(true);
    }
  });

  it("catches vendor headers", () => {
    expect(isAutomatedReply(headersOf({ "x-autoreply": "yes" }))).toBe(true);
    expect(isAutomatedReply(headersOf({ "x-autorespond": "1" }))).toBe(true);
    expect(isAutomatedReply(headersOf({ "x-auto-response-suppress": "All" }))).toBe(true);
  });

  it("catches out-of-office subjects in the languages this pool uses", () => {
    for (const s of [
      "Automatic reply: Invitation",
      "Out of office",
      "Out of the office until Monday",
      "Afwezig",
      "Automatisch antwoord: uitnodiging",
      "Absence du bureau",
      "Réponse automatique",
      "Abwesenheit",
    ]) {
      expect(isAutomatedReply(headersOf(), s), s).toBe(true);
    }
  });

  it("does not mistake a genuine reply for an auto-responder", () => {
    for (const s of [
      "Re: Nexian — freelance missions",
      "Interested, let's talk",
      "Thanks for reaching out",
      "",
    ]) {
      expect(isAutomatedReply(headersOf(), s), s).toBe(false);
    }
  });
});

describe("classifying an incoming message", () => {
  it("treats a plain reply as human", () => {
    expect(classifyIncoming("Sofie <sofie@example.test>", headersOf(), "Re: hello")).toEqual({
      kind: "human",
      address: "sofie@example.test",
    });
  });

  it("keeps the address on an automated reply, so it can still be noted", () => {
    expect(
      classifyIncoming("sofie@example.test", headersOf({ "auto-submitted": "auto-replied" })),
    ).toEqual({ kind: "automated", address: "sofie@example.test" });
  });

  it("gives up on a message with no usable sender", () => {
    expect(classifyIncoming("mailer-daemon", headersOf())).toEqual({ kind: "unusable" });
  });
});

describe("when an export is worth an alert", () => {
  const base = { userId: "u1", userName: "Rita", action: "pool_export" as const };

  it("says nothing about an ordinary small export", () => {
    expect(assessExport({ ...base, rowCount: 12, recentExports: 1 })).toBeNull();
  });

  it("warns on a single large export", () => {
    const alert = assessExport({ ...base, rowCount: 400, recentExports: 1 });
    expect(alert).toMatchObject({ kind: "large_export", severity: "warning" });
    expect(alert?.summary).toContain("Rita");
    expect(alert?.summary).toContain("400");
  });

  it("escalates on repetition, even when each export is small", () => {
    // Three exports of forty is a more interesting shape than one of a hundred.
    const alert = assessExport({ ...base, rowCount: 40, recentExports: 3 });
    expect(alert).toMatchObject({ kind: "repeated_export", severity: "critical" });
  });

  it("reports repetition ahead of size when both apply", () => {
    const alert = assessExport({ ...base, rowCount: 900, recentExports: 5 });
    expect(alert?.kind).toBe("repeated_export");
  });

  it("respects the exact thresholds", () => {
    const t = DEFAULT_EXPORT_THRESHOLDS;
    expect(assessExport({ ...base, rowCount: t.rows - 1, recentExports: 1 })).toBeNull();
    expect(assessExport({ ...base, rowCount: t.rows, recentExports: 1 })).not.toBeNull();
    expect(assessExport({ ...base, rowCount: 1, recentExports: t.perDay - 1 })).toBeNull();
    expect(assessExport({ ...base, rowCount: 1, recentExports: t.perDay })).not.toBeNull();
  });

  it("names the right dataset", () => {
    expect(
      assessExport({ ...base, action: "contacts_export", rowCount: 500, recentExports: 1 })
        ?.summary,
    ).toContain("contact list");
    expect(
      assessExport({ ...base, action: "access_log_export", rowCount: 500, recentExports: 1 })
        ?.summary,
    ).toContain("access log");
  });

  it("copes with an unnamed actor", () => {
    const alert = assessExport({ ...base, userName: "", rowCount: 400, recentExports: 1 });
    expect(alert?.summary).toContain("A staff member");
  });
});
