/**
 * Personalised invitation links, at the schema level.
 *
 * The privacy of the pre-fill rests on the token: a join_prefill token is
 * reusable (the link is opened more than once) but must be revoked the instant
 * its owner registers, and it may only ever be created against a real contact.
 * These run the real migrations, so a mistake in the token table shape fails
 * here rather than in front of a freelancer.
 */
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/worker/lib/crypto";
import {
  createActionToken,
  peekActionToken,
  revokeTokens,
} from "../src/worker/modules/notifications/tokens";
import { migratedDb, seedContact } from "./helpers/d1";

describe("the join_prefill token", () => {
  it("is accepted by the schema after migration 0009", async () => {
    const db = migratedDb();
    seedContact(db, { id: "c1" });
    const raw = await createActionToken(db as unknown as D1Database, {
      purpose: "join_prefill",
      contactId: "c1",
      payload: { channel: "email" },
    });
    const row = await peekActionToken(db as unknown as D1Database, raw);
    expect(row?.purpose).toBe("join_prefill");
    expect(row?.contact_id).toBe("c1");
  });

  it("is reusable — a second peek still resolves after the first", async () => {
    const db = migratedDb();
    seedContact(db, { id: "c1" });
    const raw = await createActionToken(db as unknown as D1Database, {
      purpose: "join_prefill",
      contactId: "c1",
    });
    // Simulate the endpoint stamping used_at on first open.
    await db.raw
      .prepare(`UPDATE action_tokens SET used_at = datetime('now') WHERE token_hash = ?`)
      .run(await sha256Hex(raw));
    // A single-use token would now be dead; this one must still resolve.
    expect(await peekActionToken(db as unknown as D1Database, raw)).not.toBeNull();
  });

  it("stores the channel so a registration can be attributed", async () => {
    const db = migratedDb();
    seedContact(db, { id: "c1" });
    const raw = await createActionToken(db as unknown as D1Database, {
      purpose: "join_prefill",
      contactId: "c1",
      payload: { channel: "linkedin" },
    });
    const row = await peekActionToken(db as unknown as D1Database, raw);
    expect(JSON.parse(row!.payload).channel).toBe("linkedin");
  });

  it("is revoked when the freelancer registers, closing the pre-fill link", async () => {
    const db = migratedDb();
    seedContact(db, { id: "c1" });
    const raw = await createActionToken(db as unknown as D1Database, {
      purpose: "join_prefill",
      contactId: "c1",
    });
    // The other purposes on the same contact must survive — only the pre-fill
    // links close on registration.
    const portal = await createActionToken(db as unknown as D1Database, {
      purpose: "portal_link",
      contactId: "c1",
    });

    await revokeTokens(db as unknown as D1Database, "c1", "join_prefill");

    expect(await peekActionToken(db as unknown as D1Database, raw)).toBeNull();
    expect(await peekActionToken(db as unknown as D1Database, portal)).not.toBeNull();
  });
});
