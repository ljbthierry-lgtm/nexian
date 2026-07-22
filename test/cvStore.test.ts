import { describe, expect, it } from "vitest";
import { extensionOf, isAcceptableCv, joinChunks, splitChunks } from "../src/worker/lib/cvStore";

describe("CV chunking", () => {
  it("round-trips a file that spans several chunks", () => {
    const bytes = new Uint8Array(1_500_000).map((_, i) => i % 251);
    const chunks = splitChunks(bytes);
    expect(chunks.length).toBe(3);
    expect(joinChunks(chunks)).toEqual(bytes);
  });

  it("round-trips a file smaller than one chunk", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    expect(joinChunks(splitChunks(bytes))).toEqual(bytes);
  });

  it("round-trips a file that is an exact multiple of the chunk size", () => {
    const bytes = new Uint8Array(512 * 1024 * 2).fill(7);
    const chunks = splitChunks(bytes);
    expect(chunks.length).toBe(2);
    expect(joinChunks(chunks).length).toBe(bytes.length);
  });

  it("never produces zero chunks, so an empty file still reads back", () => {
    expect(splitChunks(new Uint8Array(0))).toHaveLength(1);
    expect(joinChunks(splitChunks(new Uint8Array(0))).length).toBe(0);
  });
});

describe("CV type checks", () => {
  it("accepts the document types recruiters actually receive", () => {
    expect(isAcceptableCv("cv.pdf", "application/pdf")).toBe(true);
    expect(isAcceptableCv("cv.docx", "application/octet-stream")).toBe(true);
    expect(isAcceptableCv("CV.DOC", "")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isAcceptableCv("photo.png", "image/png")).toBe(false);
    expect(isAcceptableCv("script.js", "text/javascript")).toBe(false);
    expect(isAcceptableCv("noextension", "")).toBe(false);
  });

  it("reads the extension case-insensitively", () => {
    expect(extensionOf("Report.PDF")).toBe("pdf");
    expect(extensionOf("no-dot")).toBe("");
  });
});
