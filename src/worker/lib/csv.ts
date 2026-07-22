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
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  linkedin_url?: string;
  source_note?: string;
}

export interface ImportParseResult {
  rows: ImportRow[];
  skipped: { line: number; reason: string }[];
  /** Header columns we could not map — surfaced so the user can fix the file. */
  unmappedHeaders: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * Map a parsed CSV onto import rows. Anything without a usable email is skipped
 * with a reason rather than silently dropped — a half-imported list is worse
 * than a rejected one.
 */
export function mapImportRows(table: string[][]): ImportParseResult {
  const skipped: { line: number; reason: string }[] = [];
  if (!table.length) return { rows: [], skipped, unmappedHeaders: [] };

  const header = table[0]!;
  const mapping = header.map(normaliseHeader);
  const unmappedHeaders = header.filter((h, i) => h.trim() !== "" && mapping[i] === null);
  if (!mapping.includes("email")) {
    return {
      rows: [],
      skipped: [{ line: 1, reason: "No email column found — add a column headed 'Email'." }],
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
    const email = (rec.email ?? "").toLowerCase();
    if (!email) {
      skipped.push({ line: r + 1, reason: "Empty email" });
      continue;
    }
    if (!isValidEmail(email)) {
      skipped.push({ line: r + 1, reason: `Not a valid email address: ${email}` });
      continue;
    }
    if (seen.has(email)) {
      skipped.push({ line: r + 1, reason: `Duplicate of an earlier row: ${email}` });
      continue;
    }
    seen.add(email);
    rows.push({
      email,
      first_name: rec.first_name ?? "",
      last_name: rec.last_name ?? "",
      phone: rec.phone || undefined,
      linkedin_url: rec.linkedin_url || undefined,
      source_note: rec.source_note || undefined,
    });
  }
  return { rows, skipped, unmappedHeaders };
}

/** Quote a value for CSV export. */
export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n");
}
