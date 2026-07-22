/**
 * LinkedIn URL normalisation — the identity rule for half the prospect list.
 *
 * Every variant of the same profile must collapse to one key (that is what
 * dedup, suppression and the registration merge hang on), and anything that is
 * not recognisably a profile must come back null rather than become a bogus
 * unique key that blocks later imports.
 */
import { describe, expect, it } from "vitest";
import { linkedinKey, linkedinUrlFromKey } from "../src/worker/lib/linkedinKey";

describe("one profile, one key", () => {
  const CANONICAL = "in/laurent-thierry";
  const VARIANTS = [
    "https://www.linkedin.com/in/laurent-thierry",
    "http://linkedin.com/in/laurent-thierry/",
    "www.linkedin.com/in/Laurent-Thierry",
    "linkedin.com/in/laurent-thierry?utm_source=share&trk=profile",
    "https://be.linkedin.com/in/laurent-thierry",
    "  https://www.linkedin.com/in/laurent-thierry  ",
  ];

  it("collapses every way the same URL gets pasted", () => {
    for (const url of VARIANTS) {
      expect(linkedinKey(url), url).toBe(CANONICAL);
    }
  });

  it("keeps distinct profiles distinct", () => {
    expect(linkedinKey("linkedin.com/in/laurent-thierry")).not.toBe(
      linkedinKey("linkedin.com/in/laurent-thierry-2"),
    );
  });

  it("handles URL-encoded slugs (accented names)", () => {
    expect(linkedinKey("linkedin.com/in/jos%C3%A9-garc%C3%ADa")).toBe("in/josé-garcía");
  });

  it("reads Sales Navigator lead links", () => {
    expect(linkedinKey("https://www.linkedin.com/sales/lead/ACwAAA123,NAME_SEARCH,abcd")).toBe(
      "sales/acwaaa123",
    );
    expect(linkedinKey("https://www.linkedin.com/sales/people/ACwAAA123")).toBe("sales/acwaaa123");
  });

  it("reads legacy /pub/ profiles", () => {
    expect(linkedinKey("linkedin.com/pub/jan-jans/1/2b3/456")).toBe("pub/jan-jans/1/2b3/456");
  });
});

describe("what is not a profile", () => {
  it.each([
    ["", "empty"],
    ["   ", "blank"],
    ["not a url at all", "free text"],
    ["https://example.com/in/laurent", "another site entirely"],
    ["https://evillinkedin.com/in/x", "lookalike domain"],
    ["https://www.linkedin.com/", "no path"],
    ["https://www.linkedin.com/company/nexian", "a company page, not a person"],
    ["https://www.linkedin.com/in/", "profile path with no slug"],
  ])("returns null for %s (%s)", (input) => {
    expect(linkedinKey(input)).toBeNull();
  });
});

it("rebuilds a clickable URL from a key", () => {
  expect(linkedinUrlFromKey("in/laurent-thierry")).toBe(
    "https://www.linkedin.com/in/laurent-thierry",
  );
});
