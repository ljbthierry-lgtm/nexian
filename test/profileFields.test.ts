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
  NOTICE_PERIODS,
  WORK_REGIMES,
  cleanLanguageLevels,
  cleanMobility,
  mobilityHasRemote,
  cleanNoticePeriod,
  cleanWorkRegime,
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

describe("mobility across the Belgian provinces", () => {
  it("keeps only real area codes, de-duplicated", () => {
    expect(cleanMobility(["antwerp", "liege", "antwerp", "atlantis", "flanders"])).toEqual([
      "antwerp",
      "liege",
    ]);
  });

  it("accepts fully-remote as a mobility area, not a separate flag", () => {
    expect(cleanMobility(["remote", "namur"])).toEqual(["remote", "namur"]);
    expect(mobilityHasRemote(["remote", "namur"])).toBe(true);
    expect(mobilityHasRemote(["namur"])).toBe(false);
  });

  it("no longer accepts the old whole-region codes", () => {
    // Flanders/Wallonia were too coarse; they are provinces now.
    expect(cleanMobility(["flanders", "wallonia"])).toEqual([]);
  });

  it("covers Brussels, all ten provinces, and remote", () => {
    expect(BELGIAN_REGIONS).toHaveLength(12);
    const groups = new Set(BELGIAN_REGIONS.map((r) => r.group));
    expect([...groups]).toEqual(["Brussels", "Flanders", "Wallonia", "Remote"]);
  });

  it("returns an empty list for anything that is not an array of codes", () => {
    for (const junk of [null, "antwerp", 3, {}, ["", 5]]) {
      expect(cleanMobility(junk)).toEqual([]);
    }
  });

  it("labels every area", () => {
    for (const region of BELGIAN_REGIONS) {
      expect(regionLabel(region.code)).toBe(region.label);
    }
    expect(regionLabel("unknown")).toBe("unknown");
  });
});

describe("work regime", () => {
  it("keeps both codes, since a freelancer may offer both", () => {
    expect(cleanWorkRegime(["full_time", "part_time"])).toEqual(["full_time", "part_time"]);
  });

  it("drops anything that is not a regime, and de-duplicates", () => {
    expect(cleanWorkRegime(["full_time", "full_time", "weekends", 3])).toEqual(["full_time"]);
    expect(cleanWorkRegime("full_time")).toEqual([]);
  });
});

describe("notice period", () => {
  it("keeps a recognised code", () => {
    expect(cleanNoticePeriod("1_month")).toBe("1_month");
    expect(cleanNoticePeriod("immediate")).toBe("immediate");
  });

  it("returns null for anything it does not know", () => {
    for (const junk of ["someday", "", null, undefined, 30, "1month"]) {
      expect(cleanNoticePeriod(junk)).toBeNull();
    }
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

  it("shares the same work regimes and notice periods", () => {
    for (const r of WORK_REGIMES) expect(clientSrc).toContain(`code: "${r.code}"`);
    for (const n of NOTICE_PERIODS) expect(clientSrc).toContain(`code: "${n.code}"`);
  });
});
