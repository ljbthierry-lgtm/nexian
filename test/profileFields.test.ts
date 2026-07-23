/**
 * Language grading, relevant experience and mobility — the validation that
 * decides what actually gets stored.
 *
 * The forms are trusting; this module is not. A level the UI should never send,
 * a region that isn't Belgian, a corrupt JSON blob from an old row — each is
 * dropped rather than stored, so everything downstream can trust the column.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BELGIAN_REGIONS,
  GRADED_LANGUAGES,
  LANGUAGE_LEVELS,
  cleanLanguageLevels,
  cleanMobility,
  languagesFromLevels,
  regionLabel,
} from "../src/worker/lib/profileFields";

describe("language levels", () => {
  it("keeps recognised language→level pairs", () => {
    expect(cleanLanguageLevels({ French: "fluent", Dutch: "native", English: "basic" })).toEqual({
      French: "fluent",
      Dutch: "native",
      English: "basic",
    });
  });

  it("drops languages it does not grade and levels it does not know", () => {
    expect(cleanLanguageLevels({ French: "fluent", German: "native", English: "wizard" })).toEqual({
      French: "fluent",
    });
  });

  it("survives junk instead of throwing", () => {
    for (const junk of [null, undefined, "", 42, [], "not json"]) {
      expect(cleanLanguageLevels(junk)).toEqual({});
    }
  });
});

describe("the flat languages list is derived from the grades", () => {
  it("includes every graded language plus any extras, without duplicates", () => {
    expect(
      languagesFromLevels({ French: "fluent", Dutch: "native" }, ["German", "French", " "]).sort(),
    ).toEqual(["Dutch", "French", "German"]);
  });

  it("is just the extras when nothing is graded", () => {
    expect(languagesFromLevels({}, ["Spanish"])).toEqual(["Spanish"]);
  });
});

describe("mobility across the Belgian regions", () => {
  it("keeps only real region codes, de-duplicated", () => {
    expect(cleanMobility(["brussels", "flanders", "brussels", "atlantis"])).toEqual([
      "brussels",
      "flanders",
    ]);
  });

  it("returns an empty list for anything that is not an array of codes", () => {
    for (const junk of [null, "brussels", 3, {}, ["", 5]]) {
      expect(cleanMobility(junk)).toEqual([]);
    }
  });

  it("labels every region", () => {
    for (const region of BELGIAN_REGIONS) {
      expect(regionLabel(region.code)).toBe(region.label);
    }
    expect(regionLabel("unknown")).toBe("unknown");
  });
});

describe("the client mirror stays in step with the worker authority", () => {
  // src/web/profileFields.ts drives the forms; the worker copy validates. If
  // the two ever list different levels or regions, a freelancer could pick a
  // value the server then silently drops.
  const clientSrc = readFileSync(
    join(import.meta.dirname, "..", "src", "web", "profileFields.ts"),
    "utf8",
  );

  it("shares the same language levels", () => {
    for (const level of LANGUAGE_LEVELS) expect(clientSrc).toContain(`"${level}"`);
  });

  it("shares the same graded languages", () => {
    for (const lang of GRADED_LANGUAGES) expect(clientSrc).toContain(`key: "${lang.key}"`);
  });

  it("shares the same region codes", () => {
    for (const region of BELGIAN_REGIONS) expect(clientSrc).toContain(`code: "${region.code}"`);
  });
});
