import { describe, expect, it } from "vitest";
import { buildAudienceQuery, buildPoolFilter, whereClause } from "../src/worker/lib/segment";

const TODAY = new Date("2026-07-22T00:00:00Z");

describe("pool filter", () => {
  it("always excludes suppressed and anonymised people", () => {
    const frag = buildPoolFilter({}, TODAY);
    expect(frag.where).toContain("ct.suppressed = 0");
    expect(frag.where).toContain("ct.anonymized_at IS NULL");
  });

  it("matches skills on the quoted label so partial names do not leak in", () => {
    const frag = buildPoolFilter({ skills: ["Procurement"] }, TODAY);
    expect(frag.where.some((w) => w.includes(`p.skills LIKE '%"' || ? || '"%'`))).toBe(true);
    expect(frag.params).toContain("Procurement");
  });

  it("treats several skills as any-of", () => {
    const frag = buildPoolFilter({ skills: ["A", "B"] }, TODAY);
    const clause = frag.where.find((w) => w.includes("p.skills"));
    expect(clause).toContain(" OR ");
    expect(frag.params).toEqual(expect.arrayContaining(["A", "B"]));
  });

  it("ignores empty filter values instead of matching nothing", () => {
    const frag = buildPoolFilter({ skills: ["", "  "], search: "  " }, TODAY);
    expect(frag.where).toHaveLength(2); // only the two safety conditions
  });

  it("counts 'available now' as inside any availability window", () => {
    const frag = buildPoolFilter({ availableWithinDays: 30 }, TODAY);
    const clause = frag.where.find((w) => w.includes("available_from"));
    expect(clause).toContain("p.availability = 'now' OR");
    expect(frag.params).toContain("2026-08-21");
  });

  it("builds a rate window", () => {
    const frag = buildPoolFilter({ rateMin: 500, rateMax: 900 }, TODAY);
    expect(frag.params).toEqual(expect.arrayContaining([500, 900]));
  });

  it("produces an empty WHERE only when there are no conditions", () => {
    expect(whereClause({ where: [], params: [] })).toBe("");
    expect(whereClause({ where: ["a = 1"], params: [] })).toBe("WHERE a = 1");
  });
});

describe("campaign audience", () => {
  it("always joins the consent ledger and requires a granted decision", () => {
    const { sql, params } = buildAudienceQuery({}, "news", TODAY);
    expect(sql).toContain("JOIN consent_current cc");
    expect(sql).toContain("cc.granted = 1");
    expect(params[0]).toBe("news");
  });

  it("keeps the consent purpose as the first bound parameter ahead of the filters", () => {
    const { params } = buildAudienceQuery({ skills: ["Procurement"] }, "mission_alerts", TODAY);
    expect(params[0]).toBe("mission_alerts");
    expect(params[1]).toBe("Procurement");
  });

  it("cannot be built without a purpose — the type system and SQL both require it", () => {
    const { sql } = buildAudienceQuery({ rateMax: 800 }, "news", TODAY);
    // The consent join is not conditional on the segment being non-empty.
    expect(sql.match(/consent_current/g)).toHaveLength(1);
    expect(sql).toContain("ct.suppressed = 0");
  });
});
