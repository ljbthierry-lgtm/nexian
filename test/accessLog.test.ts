/**
 * The record of who read personal data.
 *
 * Two things are worth proving here. First that the list of actions in the code
 * and the CHECK constraint in the database cannot drift — if they do, writing a
 * new kind of entry fails at runtime, in production, on the one path whose whole
 * job is to leave a trace. Second that the log really is append-only, because a
 * trail an administrator can quietly edit is not evidence of anything.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCESS_ACTIONS, ACCESS_LABEL } from "../src/worker/lib/accessLog";
import { migratedDb, seedContact } from "./helpers/d1";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

/** The action values the live schema will actually accept. */
function actionsAllowedBySchema(): string[] {
  // The last migration that rebuilds the table is the one in force.
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse()
    .find((f) => /CHECK \(action IN/.test(readFileSync(join(MIGRATIONS, f), "utf8")));
  const sql = readFileSync(join(MIGRATIONS, file!), "utf8");
  const block = /CHECK \(action IN \(([\s\S]*?)\)\)/.exec(sql)?.[1] ?? "";
  return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

describe("the code and the database agree on what can be recorded", () => {
  it("allows exactly the actions the application knows about", () => {
    expect(actionsAllowedBySchema().sort()).toEqual([...ACCESS_ACTIONS].sort());
  });

  it("gives every action a label, so nothing renders as a raw enum value", () => {
    for (const action of ACCESS_ACTIONS) {
      expect(ACCESS_LABEL[action]).toBeTruthy();
      expect(ACCESS_LABEL[action]).not.toMatch(/_/);
    }
  });
});

describe("the log resists tampering", () => {
  function dbWithEntry() {
    const db = migratedDb();
    seedContact(db, { id: "c1", withProfile: true });
    db.raw
      .prepare(
        `INSERT INTO access_log (id, user_id, user_name, action, contact_id, detail)
         VALUES ('a1', NULL, 'Recruiter', 'cv_download', 'c1', 'cv.pdf')`,
      )
      .run();
    return db;
  }

  it("refuses to delete an entry", () => {
    const db = dbWithEntry();
    expect(() => db.raw.prepare(`DELETE FROM access_log WHERE id = 'a1'`).run()).toThrow(
      /append-only/,
    );
    expect(db.raw.prepare(`SELECT COUNT(*) AS n FROM access_log`).get()).toEqual({ n: 1 });
  });

  it("refuses to rewrite an entry", () => {
    const db = dbWithEntry();
    expect(() =>
      db.raw.prepare(`UPDATE access_log SET user_name = 'Somebody else' WHERE id = 'a1'`).run(),
    ).toThrow(/append-only/);
  });

  it("refuses an action it does not recognise", () => {
    const db = dbWithEntry();
    expect(() =>
      db.raw
        .prepare(
          `INSERT INTO access_log (id, user_name, action) VALUES ('a2', 'X', 'exfiltrate_everything')`,
        )
        .run(),
    ).toThrow(/CHECK constraint/i);
  });

  it("keeps the entry when the freelancer's record is deleted", () => {
    // The trail has to outlive its subject, or erasing a contact would erase the
    // evidence of who had already taken their CV.
    const db = dbWithEntry();
    db.raw.prepare(`DELETE FROM profiles WHERE contact_id = 'c1'`).run();
    db.raw.prepare(`DELETE FROM contacts WHERE id = 'c1'`).run();
    const row = db.raw.prepare(`SELECT contact_id, user_name FROM access_log`).get() as {
      contact_id: string;
      user_name: string;
    };
    expect(row.contact_id).toBe("c1");
    expect(row.user_name).toBe("Recruiter");
  });

  it("keeps the staff name when the staff account is removed", () => {
    const db = migratedDb();
    db.raw
      .prepare(
        `INSERT INTO users (id, email, name, role) VALUES ('u1', 'r@x.test', 'Rita', 'recruiter')`,
      )
      .run();
    db.raw
      .prepare(
        `INSERT INTO access_log (id, user_id, user_name, action, detail)
         VALUES ('a1', 'u1', 'Rita', 'pool_export', '40 freelancers')`,
      )
      .run();
    db.raw.prepare(`DELETE FROM users WHERE id = 'u1'`).run();
    const row = db.raw.prepare(`SELECT user_name, action FROM access_log`).get() as {
      user_name: string;
      action: string;
    };
    // The name was copied in rather than only referenced, so a leaver cannot
    // take their download history with them.
    expect(row.user_name).toBe("Rita");
    expect(row.action).toBe("pool_export");
  });
});
