/**
 * CV storage.
 *
 * Files are split into chunks and kept in D1, because the Cloudflare account this
 * runs on has no R2 entitlement. A single D1 value tops out around 2 MB, so we
 * store 512 KB slices and stream them back in order.
 *
 * This module is the ONLY place that knows where the bytes live: to move to R2
 * later, reimplement `putCv` / `getCv` / `deleteCv` against a bucket binding and
 * leave every caller untouched.
 */
import { all, run } from "./db";
import { badRequest } from "./errors";

export const CHUNK_BYTES = 512 * 1024;
export const MAX_CV_BYTES = 8 * 1024 * 1024;

export const ALLOWED_CV_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** Extension check, used when a browser sends a generic content type. */
export function extensionOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return m ? m[1]!.toLowerCase() : "";
}

/**
 * Accept only real CV documents. Browsers sometimes send
 * `application/octet-stream`, so a known extension is enough on its own.
 */
export function isAcceptableCv(filename: string, mime: string): boolean {
  if (ALLOWED_CV_TYPES[mime]) return true;
  return ["pdf", "doc", "docx"].includes(extensionOf(filename));
}

export function splitChunks(bytes: Uint8Array, chunkSize = CHUNK_BYTES): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    out.push(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  // An empty file would otherwise produce zero chunks and read back as "missing".
  return out.length ? out : [new Uint8Array(0)];
}

export function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export async function putCv(db: D1Database, contactId: string, bytes: Uint8Array): Promise<void> {
  if (bytes.length > MAX_CV_BYTES) {
    throw badRequest(
      `That file is ${(bytes.length / 1048576).toFixed(1)} MB. The limit is ${MAX_CV_BYTES / 1048576} MB — please upload a smaller PDF.`,
      "cv_too_large",
    );
  }
  const chunks = splitChunks(bytes);
  const statements = [
    db.prepare(`DELETE FROM cv_chunks WHERE contact_id = ?`).bind(contactId),
    ...chunks.map((chunk, idx) =>
      db
        .prepare(`INSERT INTO cv_chunks (contact_id, idx, data) VALUES (?, ?, ?)`)
        .bind(contactId, idx, chunk),
    ),
  ];
  // One batch = one transaction: a half-written CV can never be served.
  await db.batch(statements);
}

/**
 * Reassembled file, as an ArrayBuffer so it can be handed straight to `Response`
 * (a Uint8Array view is not a valid BodyInit).
 */
export async function getCv(db: D1Database, contactId: string): Promise<ArrayBuffer | null> {
  const rows = await all<{ data: ArrayBuffer | Uint8Array | number[] }>(
    db,
    `SELECT data FROM cv_chunks WHERE contact_id = ? ORDER BY idx ASC`,
    contactId,
  );
  if (!rows.length) return null;
  // joinChunks always allocates an exact-length buffer, so .buffer is the file.
  return joinChunks(rows.map((r) => toBytes(r.data))).buffer as ArrayBuffer;
}

export async function deleteCv(db: D1Database, contactId: string): Promise<void> {
  await run(db, `DELETE FROM cv_chunks WHERE contact_id = ?`, contactId);
}

/**
 * Make an uploader-supplied filename safe to put in a Content-Disposition header.
 *
 * An allowlist rather than a blocklist: quotes end the header value early and
 * control characters split the header outright, and it is easier to be sure about
 * what is permitted than to enumerate everything that is not. Letters and digits
 * of any script are kept, so accented names still read correctly.
 */
export function safeFilename(name: string | null | undefined, fallback = "cv"): string {
  const cleaned = (name ?? "")
    .replace(/[^\p{L}\p{N}._ ()-]/gu, "_")
    .trim()
    .slice(0, 120);
  // A name that survived as nothing but separators ("___") is safe but useless to
  // whoever downloads it, so fall back unless a letter or digit remains.
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : fallback;
}

/**
 * The download response for a stored CV. Both the freelancer's own download and
 * the staff download go through here, so the headers cannot drift apart.
 *
 * The stored MIME type is never echoed back verbatim: it is mapped through the
 * allowlist, and anything unrecognised is served as a generic binary attachment
 * so a browser cannot be talked into rendering an upload inline.
 */
export function cvResponse(bytes: ArrayBuffer, filename: string | null, mime: string | null) {
  const type = mime && ALLOWED_CV_TYPES[mime] ? mime : "application/octet-stream";
  return new Response(bytes, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${safeFilename(filename)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

/** D1 hands BLOBs back as ArrayBuffer or number[] depending on driver version. */
function toBytes(value: ArrayBuffer | Uint8Array | number[]): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  return new Uint8Array(value);
}
