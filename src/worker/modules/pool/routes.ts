/** The talent pool: registered freelancers, filtered the same way a campaign is. */
import { Hono } from "hono";
import type { AppContext } from "../../env";
import { recordAccess } from "../../lib/accessLog";
import { alertOnExport } from "../admin/exportAlert";
import { consentsFor } from "../../lib/consent";
import { toCsv } from "../../lib/csv";
import { all, first } from "../../lib/db";
import { parseLabels } from "../../lib/labels";
import {
  cleanLanguageLevels,
  cleanMobility,
  cleanWorkRegime,
  noticeLabel,
  regimeLabel,
  regionLabel,
} from "../../lib/profileFields";
import { clientIp } from "../../lib/rateLimit";
import { type Segment, buildPoolFilter, whereClause } from "../../lib/segment";
import { requireAuth } from "../../middleware/auth";

export const poolRoutes = new Hono<AppContext>();
poolRoutes.use("*", requireAuth());

/** Read a segment from query parameters (the pool screen) or a JSON body (a campaign). */
export function segmentFromQuery(q: Record<string, string>): Segment {
  const list = (value: string | undefined) =>
    (value ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  const num = (value: string | undefined) => {
    const n = Number.parseInt(value ?? "", 10);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    skills: list(q.skills),
    industries: list(q.industries),
    languages: list(q.languages),
    availability: list(q.availability) as Segment["availability"],
    availableWithinDays: num(q.availableWithinDays),
    rateMin: num(q.rateMin),
    rateMax: num(q.rateMax),
    minYears: num(q.minYears),
    stages: list(q.stages) as Segment["stages"],
    staleDays: num(q.staleDays),
    search: q.search,
  };
}

interface PoolRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  stage: string;
  headline: string;
  years_experience: number | null;
  years_relevant: number | null;
  skills: string;
  industries: string;
  languages: string;
  language_levels: string;
  mobility: string;
  work_regime: string;
  notice_period: string | null;
  certifications: string;
  daily_rate: number | null;
  currency: string;
  availability: string;
  available_from: string | null;
  location: string | null;
  remote_ok: number;
  cv_filename: string | null;
  updated_at: string;
  last_confirmed_at: string | null;
  verified_at: string | null;
}

const POOL_SELECT = `
  SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.stage,
         p.headline, p.years_experience, p.years_relevant, p.skills, p.industries, p.languages,
         p.language_levels, p.mobility, p.work_regime, p.notice_period, p.certifications,
         p.daily_rate, p.currency, p.availability, p.available_from, p.location,
         p.remote_ok, p.cv_filename, p.updated_at, p.last_confirmed_at, p.verified_at
  FROM contacts ct
  JOIN profiles p ON p.contact_id = ct.id`;

poolRoutes.get("/", async (c) => {
  const segment = segmentFromQuery(c.req.query());
  const frag = buildPoolFilter(segment);
  const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "200", 10) || 200, 500);

  const rows = await all<PoolRow>(
    c.env.DB,
    `${POOL_SELECT} ${whereClause(frag)} ORDER BY p.updated_at DESC LIMIT ?`,
    ...frag.params,
    limit,
  );
  const consents = await consentsFor(
    c.env.DB,
    rows.map((r) => r.id),
  );
  const total = await first<{ n: number }>(
    c.env.DB,
    `SELECT COUNT(*) AS n FROM contacts ct JOIN profiles p ON p.contact_id = ct.id ${whereClause(frag)}`,
    ...frag.params,
  );

  return c.json({
    total: total?.n ?? rows.length,
    freelancers: rows.map((r) => ({
      ...r,
      skills: parseLabels(r.skills),
      industries: parseLabels(r.industries),
      languages: parseLabels(r.languages),
      language_levels: safeParse(r.language_levels),
      mobility: safeParse(r.mobility),
      work_regime: safeParse(r.work_regime),
      notice_period: r.notice_period,
      certifications: parseLabels(r.certifications),
      remote_ok: r.remote_ok === 1,
      verified: r.verified_at !== null,
      consents: consents.get(r.id),
    })),
  });
});

/** The four numbers above the pool table. */
poolRoutes.get("/stats", async (c) => {
  const soon = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const stale = new Date(Date.now() - 180 * 86400000).toISOString();
  const row = await first<{
    total: number;
    available_now: number;
    available_soon: number;
    stale: number;
  }>(
    c.env.DB,
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN p.availability = 'now' THEN 1 ELSE 0 END) AS available_now,
       SUM(CASE WHEN p.availability = 'from_date' AND p.available_from IS NOT NULL
                 AND p.available_from <= ? THEN 1 ELSE 0 END) AS available_soon,
       SUM(CASE WHEN COALESCE(p.last_confirmed_at, p.updated_at) < ? THEN 1 ELSE 0 END) AS stale
     FROM contacts ct JOIN profiles p ON p.contact_id = ct.id
     WHERE ct.suppressed = 0 AND ct.anonymized_at IS NULL`,
    soon,
    stale,
  );
  return c.json({
    total: row?.total ?? 0,
    availableNow: row?.available_now ?? 0,
    availableSoon: row?.available_soon ?? 0,
    stale: row?.stale ?? 0,
  });
});

poolRoutes.get("/export/csv", async (c) => {
  const frag = buildPoolFilter(segmentFromQuery(c.req.query()));
  const rows = await all<PoolRow>(
    c.env.DB,
    `${POOL_SELECT} ${whereClause(frag)} ORDER BY ct.last_name, ct.first_name`,
    ...frag.params,
  );
  const csv = toCsv(
    [
      "First name",
      "Last name",
      "Email",
      "Headline",
      "Years total",
      "Years relevant",
      "Languages (graded)",
      "Mobility",
      "Work regime",
      "Notice period",
      "Certifications",
      "Skills",
      "Industries",
      "Languages",
      "Day rate",
      "Availability",
      "Available from",
      "Location",
      "Remote",
      "CV on file",
      "Stage",
      "Last updated",
    ],
    rows.map((r) => [
      r.first_name,
      r.last_name,
      r.email,
      r.headline,
      r.years_experience ?? "",
      r.years_relevant ?? "",
      gradedLanguages(r.language_levels),
      mobilityLabels(r.mobility),
      cleanWorkRegime(safeParse(r.work_regime)).map(regimeLabel).join("; "),
      noticeLabel(r.notice_period),
      parseLabels(r.certifications).join("; "),
      parseLabels(r.skills).join("; "),
      parseLabels(r.industries).join("; "),
      parseLabels(r.languages).join("; "),
      r.daily_rate ?? "",
      r.availability,
      r.available_from ?? "",
      r.location ?? "",
      r.remote_ok ? "yes" : "no",
      r.cv_filename ? "yes" : "no",
      r.stage,
      r.updated_at,
    ]),
  );
  const user = c.get("user");
  await recordAccess(c.env.DB, {
    userId: user.id,
    userName: user.name,
    action: "pool_export",
    detail: `${rows.length} freelancers`,
    ip: clientIp(c.req.raw.headers),
  });
  await alertOnExport(c.env, {
    userId: user.id,
    userName: user.name,
    action: "pool_export",
    rowCount: rows.length,
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nexian-talent-pool.csv"`,
    },
  });
});

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** "French: fluent; Dutch: native" for the CSV column. */
function gradedLanguages(raw: string): string {
  const levels = cleanLanguageLevels(safeParse(raw));
  return Object.entries(levels)
    .map(([lang, level]) => `${lang}: ${level}`)
    .join("; ");
}

function mobilityLabels(raw: string): string {
  return cleanMobility(safeParse(raw)).map(regionLabel).join("; ");
}
