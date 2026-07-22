/**
 * The consent ledger, against the real schema.
 *
 * Everything the app is allowed to send rests on one rule: the latest decision
 * per (contact, purpose) wins, and absence means no. A regression here is an
 * email to somebody who opted out, so it is tested by running the SQL rather
 * than by inspecting the query string.
 */
import { describe, expect, it } from "vitest";
import { buildAudienceQuery } from "../src/worker/lib/segment";
import { type FakeD1, migratedDb, seedConsent, seedContact } from "./helpers/d1";

async function audience(db: FakeD1, purpose: "news" | "mission_alerts"): Promise<string[]> {
  const { sql, params } = buildAudienceQuery({}, purpose);
  const res = await db
    .prepare(sql)
    .bind(...params)
    .all<{ id: string }>();
  return res.results.map((r) => r.id);
}

describe("consent_current resolves the latest decision", () => {
  it("treats a contact with no consent rows as opted out", async () => {
    const db = migratedDb();
    seedContact(db, { id: "c1", withProfile: true });
    expect(await audience(db, "news")).toEqual([]);
  });

  it("includes someone who granted", async () => {
    const db = migratedDb();
    seedContact(db, { id: "c1", withProfile: true });
    seedConsent(db, "c1", "news", true);
    expect(await audience(db, "news")).toEqual(["c1"]);
  });

  it("excludes them again after they withdraw", async () => {
    const db = migratedDb();
    seedContact(db, { id: "c1", withProfile: true });
    seedConsent(db, "c1", "news", true);
    seedConsent(db, "c1", "news", false);
    expect(await audience(db, "news")).toEqual([]);
  });

  it("re-includes them if they grant a third time — latest wins, not first or any", async () => {
    const db = migratedDb();
    seedContact(db, { id: "c1", withProfile: true });
    seedConsent(db, "c1", "news", true);
    seedConsent(db, "c1", "news", false);
    seedConsent(db, "c1", "news", true);
    expect(await audience(db, "news")).toEqual(["c1"]);
  });

  it("keeps the two marketing purposes independent", async () => {
    const db = migratedDb();
    seedContact(db, { id: "c1", withProfile: true });
    seedConsent(db, "c1", "mission_alerts", true);
    seedConsent(db, "c1", "news", false);
    expect(await audience(db, "mission_alerts")).toEqual(["c1"]);
    expect(await audience(db, "news")).toEqual([]);
  });

  it("never counts data_processing as permission to market", async () => {
    const db = migratedDb();
    seedContact(db, { id: "c1", withProfile: true });
    seedConsent(db, "c1", "data_processing", true);
    expect(await audience(db, "news")).toEqual([]);
    expect(await audience(db, "mission_alerts")).toEqual([]);
  });

  it("excludes a suppressed person even while their consent still reads granted", async () => {
    const db = migratedDb();
    seedContact(db, { id: "c1", withProfile: true, suppressed: true });
    seedConsent(db, "c1", "news", true);
    expect(await audience(db, "news")).toEqual([]);
  });

  it("excludes a consenting contact who never registered a profile", async () => {
    const db = migratedDb();
    seedContact(db, { id: "c1", withProfile: false });
    seedConsent(db, "c1", "news", true);
    expect(await audience(db, "news")).toEqual([]);
  });

  it("separates people: one person's consent never admits another", async () => {
    const db = migratedDb();
    seedContact(db, { id: "yes", withProfile: true });
    seedContact(db, { id: "no", withProfile: true });
    seedConsent(db, "yes", "news", true);
    expect(await audience(db, "news")).toEqual(["yes"]);
  });
});

describe("the ledger cannot be rewritten", () => {
  it("refuses to delete a consent row", () => {
    const db = migratedDb();
    seedContact(db, { id: "c1" });
    seedConsent(db, "c1", "news", true);
    expect(() => db.raw.prepare("DELETE FROM consents").run()).toThrow(/append-only/i);
  });

  it("refuses to edit a consent row", () => {
    const db = migratedDb();
    seedContact(db, { id: "c1" });
    seedConsent(db, "c1", "news", true);
    expect(() => db.raw.prepare("UPDATE consents SET granted = 0").run()).toThrow(/append-only/i);
  });

  it("refuses to delete a contact, because the cascade would take the proof with it", () => {
    const db = migratedDb();
    seedContact(db, { id: "c1" });
    seedConsent(db, "c1", "news", true);
    expect(() => db.raw.prepare("DELETE FROM contacts WHERE id = 'c1'").run()).toThrow();
    expect((db.raw.prepare("SELECT COUNT(*) AS n FROM consents").get() as { n: number }).n).toBe(1);
  });
});

describe("consent alone is not enough — the address must be proven", () => {
  it("excludes a profile that was never verified, even with consent granted", async () => {
    const db = migratedDb();
    seedContact(db, { id: "unverified", withProfile: true, verified: false });
    seedConsent(db, "unverified", "news", true);
    // Anyone can type someone else's address into the public form. Until the
    // link we emailed is opened, the consent row proves nothing.
    expect(await audience(db, "news")).toEqual([]);
  });

  it("includes them once the emailed link has been opened", async () => {
    const db = migratedDb();
    seedContact(db, { id: "later", withProfile: true, verified: false });
    seedConsent(db, "later", "news", true);
    db.raw
      .prepare(`UPDATE profiles SET verified_at = datetime('now') WHERE contact_id = 'later'`)
      .run();
    expect(await audience(db, "news")).toEqual(["later"]);
  });
});
