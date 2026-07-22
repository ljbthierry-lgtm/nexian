import { describe, expect, it } from "vitest";
import { safeFilename } from "../src/worker/lib/cvStore";

describe("Content-Disposition filename safety", () => {
  it("keeps an ordinary CV name intact", () => {
    expect(safeFilename("CV_Jane_Dupont_2026.pdf")).toBe("CV_Jane_Dupont_2026.pdf");
  });

  it("keeps accented names readable", () => {
    expect(safeFilename("CV Jérôme Müller.pdf")).toBe("CV Jérôme Müller.pdf");
  });

  it("removes quotes, which would end the header value early", () => {
    expect(safeFilename('evil".pdf')).not.toContain('"');
  });

  it("removes control characters, which would split the header", () => {
    const attack = "a\r\nX-Injected: yes\r\n.pdf";
    const safe = safeFilename(attack);
    expect(safe).not.toMatch(/[\r\n]/);
    expect(safe).not.toContain("X-Injected: yes");
  });

  it("neutralises path traversal", () => {
    expect(safeFilename("../../etc/passwd")).not.toContain("/");
    expect(safeFilename("..\\..\\windows\\system32")).not.toContain("\\");
  });

  it("falls back when nothing usable is left", () => {
    expect(safeFilename("")).toBe("cv");
    expect(safeFilename(null)).toBe("cv");
    expect(safeFilename('"""')).toBe("cv");
  });

  it("caps the length", () => {
    expect(safeFilename(`${"a".repeat(500)}.pdf`).length).toBeLessThanOrEqual(120);
  });
});
