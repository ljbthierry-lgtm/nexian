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

/**
 * Exports are opened in Excel, and Excel executes a cell that starts with `=`.
 * A freelancer types their own headline and skills, so an export is a path from
 * their keyboard into a colleague's spreadsheet — the classic CSV injection.
 */
describe("CSV export neutralises spreadsheet formulas", () => {
  const cellsOf = (value: unknown) => toCsv(["h"], [[value]]).split("\r\n")[1];

  it("defuses each character Excel treats as the start of a formula", () => {
    for (const lead of ["=", "+", "-", "@"]) {
      const cell = cellsOf(`${lead}cmd|' /C calc'!A0`);
      expect(cell?.startsWith("'")).toBe(true);
      expect(cell?.startsWith(lead)).toBe(false);
    }
  });

  it("defuses the tab and carriage return leads too", () => {
    // Quoted, because they also need CSV escaping — the guard quote goes inside.
    expect(cellsOf("\tcmd")).toBe(`"'\tcmd"`);
    expect(cellsOf("\r=1+1")).toBe(`"'\r=1+1"`);
  });

  it("still quotes a dangerous value that also contains a delimiter", () => {
    expect(cellsOf('=HYPERLINK("http://evil","x"),y')).toBe(
      `"'=HYPERLINK(""http://evil"",""x""),y"`,
    );
  });

  it("leaves ordinary values completely alone", () => {
    expect(cellsOf("Jane Dupont")).toBe("Jane Dupont");
    expect(cellsOf("Procurement; Change management")).toBe('"Procurement; Change management"');
    expect(cellsOf(750)).toBe("750");
    expect(cellsOf(null)).toBe("");
  });

  it("does not mangle a negative number into a formula guard by accident", () => {
    // A minus lead is guarded even on a number, because Excel cannot tell the
    // difference between -1 and -1+cmd until it has already parsed it.
    expect(cellsOf(-250)).toBe("'-250");
  });

  it("guards header cells as well as body cells", () => {
    expect(toCsv(["=BAD()"], []).split("\r\n")[0]).toBe("'=BAD()");
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
