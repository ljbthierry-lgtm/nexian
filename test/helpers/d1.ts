/**
 * A D1 stand-in backed by Node's built-in SQLite, so the rules that live in SQL
 * can be tested against the real schema.
 *
 * The rules that matter most in this app — "the latest consent decision wins"
 * and "the retention sweep must never touch a registered freelancer" — are
 * expressed as SQL, not TypeScript. Asserting on query *strings* would prove
 * only spelling; running the migrations and querying them proves behaviour.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// Loaded through createRequire, and via a variable, because the bundler Vitest
// runs on does not recognise `node:sqlite` as a built-in and tries to resolve it
// as a package. A static import fails before any test runs.
const requireNode = createRequire(import.meta.url);
const sqliteModuleId = "node:sqlite";
const { DatabaseSync } = requireNode(sqliteModuleId) as typeof import("node:sqlite");
type DatabaseSync = InstanceType<typeof DatabaseSync>;

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "migrations");

type Params = unknown[];

/** The slice of the D1 interface this codebase actually uses. */
export interface FakeD1 {
  prepare(sql: string): {
    bind(...params: Params): {
      all<T>(): Promise<{ results: T[] }>;
      first<T>(): Promise<T | null>;
      run(): Promise<{ meta: { changes: number } }>;
    };
    all<T>(): Promise<{ results: T[] }>;
    first<T>(): Promise<T | null>;
    run(): Promise<{ meta: { changes: number } }>;
  };
  batch(statements: unknown[]): Promise<unknown[]>;
  /** Escape hatch for arranging test data. */
  raw: DatabaseSync;
}

function statement(db: DatabaseSync, sql: string, bound: Params = []) {
  const exec = () => db.prepare(sql);
  return {
    bind(...params: Params) {
      return statement(db, sql, params);
    },
    async all<T>() {
      return { results: exec().all(...(bound as never[])) as T[] };
    },
    async first<T>() {
      return (exec().get(...(bound as never[])) as T | undefined) ?? null;
    },
    async run() {
      const res = exec().run(...(bound as never[]));
      return { meta: { changes: Number(res.changes) } };
    },
  };
}

/** A fresh in-memory database with every migration applied, in order. */
export function migratedDb(): FakeD1 {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return {
    prepare: (sql: string) => statement(db, sql),
    async batch(statements: unknown[]) {
      return statements;
    },
    raw: db,
  };
}

/** Insert a contact, and optionally the profile that makes them a pool member. */
export function seedContact(
  db: FakeD1,
  opts: {
    id: string;
    email?: string;
    withProfile?: boolean;
    /** Defaults to true: most tests care about an established pool member. */
    verified?: boolean;
    createdAt?: string;
    lastOutreachAt?: string | null;
    suppressed?: boolean;
  },
): void {
  db.raw
    .prepare(
      `INSERT INTO contacts (id, email, first_name, last_name, created_at, last_outreach_at, suppressed)
       VALUES (?, ?, 'Test', 'Person', ?, ?, ?)`,
    )
    .run(
      opts.id,
      opts.email ?? `${opts.id}@example.test`,
      opts.createdAt ?? "2020-01-01 00:00:00",
      opts.lastOutreachAt ?? null,
      opts.suppressed ? 1 : 0,
    );
  if (opts.withProfile) {
    db.raw
      .prepare(`INSERT INTO profiles (contact_id, availability, verified_at) VALUES (?, 'now', ?)`)
      .run(opts.id, opts.verified === false ? null : "2026-01-01 00:00:00");
  }
}

/** Append a consent decision, exactly as the application does. */
export function seedConsent(
  db: FakeD1,
  contactId: string,
  purpose: string,
  granted: boolean,
): void {
  db.raw
    .prepare(
      `INSERT INTO consents (id, contact_id, purpose, granted, source)
       VALUES (?, ?, ?, ?, 'registration_form')`,
    )
    .run(
      `${contactId}-${purpose}-${granted ? 1 : 0}-${Math.random()}`,
      contactId,
      purpose,
      granted ? 1 : 0,
    );
}
