/**
 * D1 rejects any query carrying more than 100 bound parameters. The unit harness
 * runs node:sqlite, whose limit is ~32 000, so a plain "insert 200 rows" test
 * would pass even against the unchunked code that breaks in production.
 *
 * These tests wrap the database so a single query with >100 bound parameters
 * throws exactly as D1 does, then prove that `selectByChunks` (and the callers
 * that route through it) stay under the cap while still returning every row.
 */
import { describe, expect, it } from "vitest";
import { selectByChunks } from "../src/worker/lib/db";
import { filterSuppressedHashes } from "../src/worker/lib/suppression";
import { type FakeD1, migratedDb, seedContact } from "./helpers/d1";

const D1_PARAM_CAP = 100;

/** A view over a FakeD1 that throws, like D1, when one query binds > cap params. */
function withD1ParamCap(db: FakeD1, cap = D1_PARAM_CAP): D1Database {
  const guard = (n: number) => {
    if (n > cap) throw new Error(`D1_ERROR: too many SQL variables (${n} > ${cap})`);
  };
  // Loosely typed on purpose: FakeD1's bound statement is a different shape from
  // its prepared statement, and this is throwaway test glue around both.
  const wrap = (stmt: any, bound: number): any => ({
    bind: (...params: unknown[]) => wrap(stmt.bind(...params), params.length),
    all: async () => {
      guard(bound);
      return stmt.all();
    },
    first: async () => {
      guard(bound);
      return stmt.first();
    },
    run: async () => {
      guard(bound);
      return stmt.run();
    },
  });
  return {
    prepare: (sql: string) => wrap(db.prepare(sql), 0),
  } as unknown as D1Database;
}

describe("selectByChunks respects D1's 100-parameter limit", () => {
  it("returns every row for a list far longer than the cap", async () => {
    const db = migratedDb();
    const ids = Array.from({ length: 250 }, (_, i) => `c${i}`);
    for (const id of ids) seedContact(db, { id });

    const rows = await selectByChunks<{ id: string }>(
      withD1ParamCap(db),
      (ph) => `SELECT id FROM contacts WHERE id IN (${ph})`,
      ids,
    );
    expect(rows.map((r) => r.id).sort()).toEqual([...ids].sort());
  });

  it("makes no query and returns nothing for an empty list", async () => {
    const db = migratedDb();
    const rows = await selectByChunks(
      withD1ParamCap(db),
      // A query that would be a syntax error if it were ever executed, proving
      // the empty case short-circuits before touching the database.
      () => `SELECT id FROM contacts WHERE id IN ()`,
      [],
    );
    expect(rows).toEqual([]);
  });

  it("confirms the cap is real: one unchunked query over the cap throws", async () => {
    const db = migratedDb();
    const ids = Array.from({ length: 250 }, (_, i) => `c${i}`);
    for (const id of ids) seedContact(db, { id });
    const capped = withD1ParamCap(db);
    const placeholders = ids.map(() => "?").join(", ");
    await expect(
      capped
        .prepare(`SELECT id FROM contacts WHERE id IN (${placeholders})`)
        .bind(...ids)
        .all(),
    ).rejects.toThrow(/too many SQL variables/);
  });
});

describe("suppression check survives a large import", () => {
  it("matches more than 100 opted-out identities without exceeding the cap", async () => {
    const db = migratedDb();
    const present = Array.from({ length: 150 }, (_, i) => `hash-${i}`);
    for (const hash of present) {
      db.raw
        .prepare(`INSERT INTO suppression_list (email_hash, reason) VALUES (?, 'test')`)
        .run(hash);
    }
    const absent = Array.from({ length: 30 }, (_, i) => `missing-${i}`);

    const blocked = await filterSuppressedHashes(withD1ParamCap(db), [...present, ...absent]);
    expect(blocked.size).toBe(present.length);
    for (const hash of present) expect(blocked.has(hash)).toBe(true);
    for (const hash of absent) expect(blocked.has(hash)).toBe(false);
  });
});
