/**
 * The nightly retention sweep, against the real schema.
 *
 * This job erases names, phone numbers and addresses without anyone watching,
 * and there is no undo. The single thing standing between it and a registered
 * freelancer is one NOT EXISTS clause, so that clause is tested directly.
 */
import { describe, expect, it } from "vitest";
import type { Env } from "../src/worker/env";
import { anonymiseContact, findExpiredProspects } from "../src/worker/modules/admin/retention";
import { type FakeD1, migratedDb, seedContact } from "./helpers/d1";

const NOW = new Date("2026-07-22T00:00:00Z");

function envOf(db: FakeD1, retentionDays = "365"): Env {
  return { DB: db as unknown as D1Database, PROSPECT_RETENTION_DAYS: retentionDays } as Env;
}

const OLD = "2020-01-01 00:00:00";
const RECENT = "2026-07-01 00:00:00";

describe("who the sweep selects", () => {
  it("selects a prospect who never registered and is past the window", async () => {
    const db = migratedDb();
    seedContact(db, { id: "old-prospect", createdAt: OLD });
    const found = await findExpiredProspects(envOf(db), NOW);
    expect(found.map((f) => f.id)).toEqual(["old-prospect"]);
  });

  it("NEVER selects a registered freelancer, however old the record", async () => {
    const db = migratedDb();
    seedContact(db, { id: "member", createdAt: OLD, withProfile: true });
    const found = await findExpiredProspects(envOf(db), NOW);
    expect(found).toEqual([]);
  });

  it("leaves a prospect who is still inside the retention window", async () => {
    const db = migratedDb();
    seedContact(db, { id: "recent", createdAt: RECENT });
    const found = await findExpiredProspects(envOf(db), NOW);
    expect(found).toEqual([]);
  });

  it("measures from the last outreach, not the date we added them", async () => {
    const db = migratedDb();
    // Added long ago, but contacted recently: the clock restarts on contact.
    seedContact(db, { id: "recently-contacted", createdAt: OLD, lastOutreachAt: RECENT });
    const found = await findExpiredProspects(envOf(db), NOW);
    expect(found).toEqual([]);
  });

  it("does not select a record that was already anonymised", async () => {
    const db = migratedDb();
    seedContact(db, { id: "done", createdAt: OLD });
    db.raw.prepare(`UPDATE contacts SET anonymized_at = '2021-01-01' WHERE id = 'done'`).run();
    expect(await findExpiredProspects(envOf(db), NOW)).toEqual([]);
  });

  it("honours a shorter configured retention period", async () => {
    const db = migratedDb();
    seedContact(db, { id: "p", createdAt: RECENT });
    expect(await findExpiredProspects(envOf(db, "365"), NOW)).toEqual([]);
    expect((await findExpiredProspects(envOf(db, "7"), NOW)).map((f) => f.id)).toEqual(["p"]);
  });

  it("falls back to a sane period when the setting is missing or nonsense", async () => {
    const db = migratedDb();
    seedContact(db, { id: "old", createdAt: OLD });
    expect((await findExpiredProspects(envOf(db, "not-a-number"), NOW)).map((f) => f.id)).toEqual([
      "old",
    ]);
  });

  it("picks the right people out of a mixed database", async () => {
    const db = migratedDb();
    seedContact(db, { id: "sweep-me", createdAt: OLD });
    seedContact(db, { id: "member", createdAt: OLD, withProfile: true });
    seedContact(db, { id: "fresh", createdAt: RECENT });
    const found = await findExpiredProspects(envOf(db), NOW);
    expect(found.map((f) => f.id)).toEqual(["sweep-me"]);
  });
});

describe("what anonymising does", () => {
  it("removes the personal fields but keeps the row as a tombstone", async () => {
    const db = migratedDb();
    seedContact(db, { id: "p", email: "someone@real.test", createdAt: OLD });
    db.raw
      .prepare(`UPDATE contacts SET phone = '+32', internal_notes = 'notes' WHERE id = 'p'`)
      .run();

    await anonymiseContact(envOf(db), "p");

    const row = db.raw.prepare(`SELECT * FROM contacts WHERE id = 'p'`).get() as Record<
      string,
      unknown
    >;
    expect(row).toBeTruthy();
    expect(row.first_name).toBe("");
    expect(row.phone).toBeNull();
    expect(row.internal_notes).toBeNull();
    expect(String(row.email)).not.toContain("real.test");
    expect(row.anonymized_at).toBeTruthy();
  });

  it("keeps the activity trail, which is the evidence the cleanup happened", async () => {
    const db = migratedDb();
    seedContact(db, { id: "p", createdAt: OLD });
    await anonymiseContact(envOf(db), "p");
    const n = (
      db.raw.prepare(`SELECT COUNT(*) AS n FROM activity WHERE contact_id = 'p'`).get() as {
        n: number;
      }
    ).n;
    expect(n).toBeGreaterThan(0);
  });

  it("is idempotent — a second sweep finds nothing left to do", async () => {
    const db = migratedDb();
    seedContact(db, { id: "p", createdAt: OLD });
    await anonymiseContact(envOf(db), "p");
    expect(await findExpiredProspects(envOf(db), NOW)).toEqual([]);
  });
});
