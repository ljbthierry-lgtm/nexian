import { describe, expect, it } from "vitest";
import { detectDelimiter, mapImportRows, parseCsv, toCsv } from "../src/worker/lib/csv";

describe("CSV parsing", () => {
  it("handles quoted fields containing the delimiter", () => {
    const rows = parseCsv('a,b\n"Dupont, Jane",x');
    expect(rows[1]).toEqual(["Dupont, Jane", "x"]);
  });

  it("handles doubled quotes", () => {
    expect(parseCsv('a\n"She said ""hi"""')[1]).toEqual(['She said "hi"']);
  });

  it("detects semicolon files written by Excel in a European locale", () => {
    expect(detectDelimiter("Email;First name;Last name")).toBe(";");
    expect(detectDelimiter("Email,First name,Last name")).toBe(",");
  });

  it("strips the byte-order mark Excel writes", () => {
    expect(parseCsv("﻿Email\njane@example.com")[0]).toEqual(["Email"]);
  });

  it("drops entirely blank lines", () => {
    expect(parseCsv("a,b\n\n\nc,d")).toHaveLength(2);
  });
});

describe("import mapping", () => {
  it("maps the headers a LinkedIn export produces", () => {
    const res = mapImportRows(
      parseCsv("First Name,Last Name,Email Address\nJane,Dupont,jane@example.com"),
    );
    expect(res.rows).toEqual([
      {
        email: "jane@example.com",
        first_name: "Jane",
        last_name: "Dupont",
        phone: undefined,
        linkedin_url: undefined,
        source_note: undefined,
      },
    ]);
  });

  it("refuses a file with no email column and says why", () => {
    const res = mapImportRows(parseCsv("Name,Company\nJane,Acme"));
    expect(res.rows).toHaveLength(0);
    expect(res.skipped[0]?.reason).toContain("No email column");
  });

  it("skips invalid addresses with a reason instead of importing junk", () => {
    const res = mapImportRows(parseCsv("Email\nnot-an-email\njane@example.com"));
    expect(res.rows).toHaveLength(1);
    expect(res.skipped[0]?.reason).toContain("Not a valid email address");
  });

  it("collapses duplicates inside one file", () => {
    const res = mapImportRows(parseCsv("Email\njane@example.com\nJANE@example.com"));
    expect(res.rows).toHaveLength(1);
    expect(res.skipped[0]?.reason).toContain("Duplicate");
  });

  it("reports headers it could not map so the user can fix the file", () => {
    const res = mapImportRows(parseCsv("Email,Salary expectation\njane@example.com,900"));
    expect(res.unmappedHeaders).toContain("Salary expectation");
  });
});

describe("CSV export", () => {
  it("quotes values containing separators or newlines", () => {
    const csv = toCsv(["a", "b"], [["plain", 'has "quotes", commas']]);
    expect(csv).toContain('"has ""quotes"", commas"');
  });
});
