/**
 * Action tokens, against the real schema.
 *
 * These are the entire security model of every email button. Three regressions
 * matter and each is tested here: replay (a forwarded email or a link scanner
 * granting a stranger a session over someone's CV and day rate), purpose
 * confusion (an unsubscribe token — deliberately reusable, valid for a year —
 * being redeemed on the set-password path), and expiry.
 */
import { describe, expect, it } from "vitest";
import {
  consumeActionToken,
  createActionToken,
  peekActionToken,
  revokeTokens,
} from "../src/worker/modules/notifications/tokens";
import { migratedDb, seedContact } from "./helpers/d1";

function setup() {
  const db = migratedDb();
  seedContact(db, { id: "c1", withProfile: true });
  return db;
}

describe("issuing", () => {
  it("returns a high-entropy token and stores only its hash", async () => {
    const db = setup();
    const raw = await createActionToken(db as never, { purpose: "portal_link", contactId: "c1" });
    expect(raw).toMatch(/^[0-9a-f]{64}$/);

    const stored = db.raw.prepare(`SELECT token_hash FROM action_tokens`).get() as {
      token_hash: string;
    };
    expect(stored.token_hash).not.toBe(raw);
    expect(stored.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("issues a different token every time", async () => {
    const db = setup();
    const a = await createActionToken(db as never, { purpose: "portal_link", contactId: "c1" });
    const b = await createActionToken(db as never, { purpose: "portal_link", contactId: "c1" });
    expect(a).not.toBe(b);
  });
});

describe("single use", () => {
  it("accepts a portal link once and refuses the replay", async () => {
    const db = setup();
    const raw = await createActionToken(db as never, { purpose: "portal_link", contactId: "c1" });
    expect(await consumeActionToken(db as never, raw, "portal_link")).toBeTruthy();
    expect(await consumeActionToken(db as never, raw, "portal_link")).toBeNull();
  });

  it("lets an unsubscribe link keep working, so an old email never traps anyone", async () => {
    const db = setup();
    const raw = await createActionToken(db as never, { purpose: "unsubscribe", contactId: "c1" });
    expect(await consumeActionToken(db as never, raw, "unsubscribe")).toBeTruthy();
    expect(await consumeActionToken(db as never, raw, "unsubscribe")).toBeTruthy();
  });

  it("does not spend the token when merely rendering the landing page", async () => {
    const db = setup();
    const raw = await createActionToken(db as never, {
      purpose: "confirm_availability",
      contactId: "c1",
    });
    expect(await peekActionToken(db as never, raw)).toBeTruthy();
    expect(await peekActionToken(db as never, raw)).toBeTruthy();
    expect(await consumeActionToken(db as never, raw, "confirm_availability")).toBeTruthy();
  });
});

describe("purpose confusion", () => {
  it("refuses to redeem a token against a different purpose", async () => {
    const db = setup();
    const unsubscribe = await createActionToken(db as never, {
      purpose: "unsubscribe",
      contactId: "c1",
    });
    // The nightmare case: a year-long reusable marketing token spending itself
    // as a staff password reset.
    expect(await consumeActionToken(db as never, unsubscribe, "set_password")).toBeNull();
    expect(await consumeActionToken(db as never, unsubscribe, "portal_link")).toBeNull();
    // …and it is still valid for what it actually is.
    expect(await consumeActionToken(db as never, unsubscribe, "unsubscribe")).toBeTruthy();
  });
});

describe("expiry and shape", () => {
  it("rejects an expired token", async () => {
    const db = setup();
    const raw = await createActionToken(db as never, { purpose: "portal_link", contactId: "c1" });
    db.raw.prepare(`UPDATE action_tokens SET expires_at = '2020-01-01T00:00:00.000Z'`).run();
    expect(await peekActionToken(db as never, raw)).toBeNull();
    expect(await consumeActionToken(db as never, raw, "portal_link")).toBeNull();
  });

  it("rejects anything that is not a 64-character hex token without touching the database", async () => {
    const db = setup();
    for (const bad of ["", "abc", "../../etc", "x".repeat(64), `${"a".repeat(63)}Z`]) {
      expect(await peekActionToken(db as never, bad)).toBeNull();
    }
  });
});

describe("revocation", () => {
  it("drops every outstanding link for a contact, as deletion must", async () => {
    const db = setup();
    const portal = await createActionToken(db as never, {
      purpose: "portal_link",
      contactId: "c1",
    });
    const unsub = await createActionToken(db as never, { purpose: "unsubscribe", contactId: "c1" });
    await revokeTokens(db as never, "c1");
    expect(await peekActionToken(db as never, portal)).toBeNull();
    expect(await peekActionToken(db as never, unsub)).toBeNull();
  });

  it("can revoke a single purpose without touching the others", async () => {
    const db = setup();
    const portal = await createActionToken(db as never, {
      purpose: "portal_link",
      contactId: "c1",
    });
    const unsub = await createActionToken(db as never, { purpose: "unsubscribe", contactId: "c1" });
    await revokeTokens(db as never, "c1", "portal_link");
    expect(await peekActionToken(db as never, portal)).toBeNull();
    expect(await peekActionToken(db as never, unsub)).toBeTruthy();
  });
});
