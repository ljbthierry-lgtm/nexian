/**
 * The invite wave's selection rule, run against the real schema.
 *
 * The wave mails strangers unattended, nightly. The one thing it must never do
 * is select somebody outside "never touched, reachable by email, still a
 * prospect" — each exclusion here is a person who must NOT get an email, so
 * each gets its own row and its own assertion.
 */
import { describe, expect, it } from "vitest";
import {
  clampLimit,
  countWaveRemaining,
  readWave,
  writeWave,
} from "../src/worker/modules/outreach/wave";
import { type FakeD1, migratedDb, seedContact } from "./helpers/d1";

function seedProspect(
  db: FakeD1,
  id: string,
  over: {
    email?: string | null;
    outreach?: number;
    suppressed?: boolean;
    withProfile?: boolean;
    anonymized?: boolean;
  } = {},
) {
  db.raw
    .prepare(
      `INSERT INTO contacts (id, email, first_name, last_name, outreach_count, suppressed, anonymized_at)
       VALUES (?, ?, 'P', ?, ?, ?, ?)`,
    )
    .run(
      id,
      over.email === undefined ? `${id}@example.test` : over.email,
      id,
      over.outreach ?? 0,
      over.suppressed ? 1 : 0,
      over.anonymized ? "2026-01-01 00:00:00" : null,
    );
  if (over.withProfile) {
    db.raw.prepare(`INSERT INTO profiles (contact_id, availability) VALUES (?, 'now')`).run(id);
  }
}

describe("who the wave selects", () => {
  it("counts exactly the untouched, reachable, unregistered people", async () => {
    const db = migratedDb();
    seedProspect(db, "fresh-1");
    seedProspect(db, "fresh-2");
    // Each of these is one reason a person must NOT be selected:
    seedProspect(db, "no-email", { email: null });
    seedProspect(db, "touched", { outreach: 1 });
    seedProspect(db, "capped", { outreach: 2 });
    seedProspect(db, "opted-out", { suppressed: true });
    seedProspect(db, "registered", { withProfile: true });
    seedProspect(db, "anonymised", { anonymized: true });

    expect(await countWaveRemaining(db as unknown as D1Database)).toBe(2);
  });

  it("reports zero on an empty database rather than failing", async () => {
    expect(await countWaveRemaining(migratedDb() as unknown as D1Database)).toBe(0);
  });
});

describe("wave state round-trip", () => {
  it("stores and reads back the running state", async () => {
    const db = migratedDb() as unknown as D1Database;
    expect((await readWave(db)).active).toBe(false);

    await writeWave(db, {
      active: true,
      dailyLimit: 25,
      startedAt: "2026-07-22T07:00:00.000Z",
      completedAt: null,
    });
    const state = await readWave(db);
    expect(state.active).toBe(true);
    expect(state.dailyLimit).toBe(25);
    expect(state.startedAt).toBe("2026-07-22T07:00:00.000Z");
  });

  it("survives a corrupted settings row by falling back to idle", async () => {
    const fake = migratedDb();
    fake.raw
      .prepare(`INSERT INTO settings (key, value) VALUES ('invite_wave', 'not json at all')`)
      .run();
    const state = await readWave(fake as unknown as D1Database);
    expect(state.active).toBe(false);
  });
});

describe("the daily limit is always sane", () => {
  it.each([
    [40, 40],
    [1, 1],
    [100, 100],
    [0, 1],
    [-5, 1],
    [10_000, 100],
    [Number.NaN, 40],
    [undefined, 40],
    ["25", 25],
    ["garbage", 40],
  ] as const)("clampLimit(%s) -> %s", (input, expected) => {
    expect(clampLimit(input)).toBe(expected);
  });
});
