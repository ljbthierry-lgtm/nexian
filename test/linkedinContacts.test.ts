/**
 * LinkedIn-only contacts: the import mapping, the schema they land in, and the
 * suppression that must survive them.
 */
import { describe, expect, it } from "vitest";
import { mapImportRows, parseCsv } from "../src/worker/lib/csv";
import { linkedinKey } from "../src/worker/lib/linkedinKey";
import {
  filterSuppressedHashes,
  linkedinHash,
  suppressLinkedin,
} from "../src/worker/lib/suppression";
import { migratedDb } from "./helpers/d1";

describe("importing a half-emailed list (the real 350-person case)", () => {
  const csv = [
    "First name,Last name,Email,LinkedIn",
    "Ann,Both,ann@example.test,linkedin.com/in/ann-both",
    "Ben,EmailOnly,ben@example.test,",
    "Cleo,LinkedInOnly,,https://www.linkedin.com/in/cleo-li",
    "Dov,Neither,,",
    "Eva,BadMailGoodLi,not-an-email,linkedin.com/in/eva-x",
    "Ann,Again,ann@example.test,linkedin.com/in/ann-both",
  ].join("\n");

  const parsed = mapImportRows(parseCsv(csv), linkedinKey);

  it("imports everyone reachable through either channel", () => {
    expect(parsed.rows.map((r) => r.last_name)).toEqual([
      "Both",
      "EmailOnly",
      "LinkedInOnly",
      "BadMailGoodLi",
    ]);
  });

  it("keeps the LinkedIn identity as a normalised key", () => {
    expect(parsed.rows[2]).toMatchObject({ email: undefined, linkedin_key: "in/cleo-li" });
  });

  it("skips only the truly unreachable, with a reason", () => {
    expect(parsed.skipped).toHaveLength(2);
    expect(parsed.skipped[0]!.reason).toContain("No email address and no usable LinkedIn");
    expect(parsed.skipped[1]!.reason).toContain("Duplicate");
  });

  it("imports a row whose email is mangled but warns about it", () => {
    expect(parsed.rows[3]).toMatchObject({ email: undefined, linkedin_key: "in/eva-x" });
    expect(parsed.warnings.some((w) => w.note.includes("not-an-email"))).toBe(true);
  });

  it("still refuses a file with neither an email nor a LinkedIn column", () => {
    const res = mapImportRows(parseCsv("First name,Phone\nAnn,123"), linkedinKey);
    expect(res.rows).toHaveLength(0);
    expect(res.skipped[0]!.reason).toContain("No email or LinkedIn column");
  });
});

describe("the schema accepts what the code now produces", () => {
  it("stores a contact with no email, and enforces one key per profile", () => {
    const db = migratedDb();
    db.raw
      .prepare(
        `INSERT INTO contacts (id, first_name, last_name, linkedin_url, linkedin_key)
         VALUES ('li-1', 'Cleo', 'Li', 'linkedin.com/in/cleo-li', 'in/cleo-li')`,
      )
      .run();
    // The same profile again must be refused by the partial unique index.
    expect(() =>
      db.raw
        .prepare(
          `INSERT INTO contacts (id, first_name, last_name, linkedin_key)
           VALUES ('li-2', 'Cleo', 'Duplicate', 'in/cleo-li')`,
        )
        .run(),
    ).toThrow(/UNIQUE/i);
    // But several email-less, key-less rows may coexist (NULL is not a value).
    db.raw.prepare(`INSERT INTO contacts (id, first_name) VALUES ('x1', 'A')`).run();
    db.raw.prepare(`INSERT INTO contacts (id, first_name) VALUES ('x2', 'B')`).run();
  });
});

describe("an opt-out sticks to the LinkedIn identity", () => {
  it("suppression by key survives and is found again", async () => {
    const db = migratedDb() as unknown as D1Database;
    await suppressLinkedin(db, "in/cleo-li", "Asked to stop");
    const hash = await linkedinHash("in/cleo-li");
    expect((await filterSuppressedHashes(db, [hash])).has(hash)).toBe(true);
    // A different profile is untouched.
    const other = await linkedinHash("in/somebody-else");
    expect((await filterSuppressedHashes(db, [other])).has(other)).toBe(false);
  });
});
