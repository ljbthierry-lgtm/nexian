/**
 * Pool filtering and campaign audiences — pure SQL builders, no database access,
 * so the rules can be unit-tested directly.
 *
 * The same filter shape drives the Talent pool table and a campaign's audience.
 * That is deliberate: what a recruiter sees on screen is exactly who receives the
 * mail, so "Campaign to this segment" can never quietly mean something else.
 */
import type { CampaignPurpose, Stage } from "../env";

export interface Segment {
  /** Match any of these skill labels. */
  skills?: string[];
  industries?: string[];
  languages?: string[];
  availability?: ("now" | "from_date" | "not_available" | "unknown")[];
  /** Available now, or with a start date within N days. */
  availableWithinDays?: number;
  rateMin?: number;
  rateMax?: number;
  minYears?: number;
  stages?: Stage[];
  /** Profile untouched for at least this many days. */
  staleDays?: number;
  /** Free text over name and email. */
  search?: string;
}

export interface SqlFragment {
  where: string[];
  params: unknown[];
}

/** JSON array columns hold quoted labels, so match on the quoted form. */
function jsonArrayAnyOf(column: string, values: string[], frag: SqlFragment): void {
  const clauses = values.map(() => `${column} LIKE '%"' || ? || '"%'`);
  frag.where.push(`(${clauses.join(" OR ")})`);
  frag.params.push(...values);
}

function cleanList(values: string[] | undefined): string[] {
  return (values ?? []).map((v) => v.trim()).filter((v) => v.length > 0);
}

/**
 * Filters over `contacts ct JOIN profiles p`. Callers supply those aliases.
 * Suppressed and anonymised people are excluded here, once, for every consumer.
 */
export function buildPoolFilter(segment: Segment, today = new Date()): SqlFragment {
  const frag: SqlFragment = { where: [], params: [] };

  frag.where.push("ct.suppressed = 0");
  frag.where.push("ct.anonymized_at IS NULL");

  const skills = cleanList(segment.skills);
  if (skills.length) jsonArrayAnyOf("p.skills", skills, frag);

  const industries = cleanList(segment.industries);
  if (industries.length) jsonArrayAnyOf("p.industries", industries, frag);

  const languages = cleanList(segment.languages);
  if (languages.length) jsonArrayAnyOf("p.languages", languages, frag);

  const availability = cleanList(segment.availability);
  if (availability.length) {
    frag.where.push(`p.availability IN (${availability.map(() => "?").join(", ")})`);
    frag.params.push(...availability);
  }

  if (typeof segment.availableWithinDays === "number" && segment.availableWithinDays >= 0) {
    const cutoff = new Date(today.getTime() + segment.availableWithinDays * 86400000)
      .toISOString()
      .slice(0, 10);
    // "Available now" always qualifies; a future start date must fall inside the window.
    frag.where.push(
      `(p.availability = 'now' OR (p.availability = 'from_date' AND p.available_from IS NOT NULL AND p.available_from <= ?))`,
    );
    frag.params.push(cutoff);
  }

  if (typeof segment.rateMin === "number") {
    frag.where.push("p.daily_rate IS NOT NULL AND p.daily_rate >= ?");
    frag.params.push(segment.rateMin);
  }
  if (typeof segment.rateMax === "number") {
    frag.where.push("p.daily_rate IS NOT NULL AND p.daily_rate <= ?");
    frag.params.push(segment.rateMax);
  }
  if (typeof segment.minYears === "number") {
    frag.where.push("p.years_experience IS NOT NULL AND p.years_experience >= ?");
    frag.params.push(segment.minYears);
  }

  const stages = cleanList(segment.stages);
  if (stages.length) {
    frag.where.push(`ct.stage IN (${stages.map(() => "?").join(", ")})`);
    frag.params.push(...stages);
  }

  if (typeof segment.staleDays === "number" && segment.staleDays > 0) {
    const cutoff = new Date(today.getTime() - segment.staleDays * 86400000).toISOString();
    frag.where.push("p.updated_at < ?");
    frag.params.push(cutoff);
  }

  const search = (segment.search ?? "").trim();
  if (search) {
    frag.where.push(
      "(ct.first_name LIKE ? OR ct.last_name LIKE ? OR ct.email LIKE ? OR p.headline LIKE ?)",
    );
    const like = `%${search}%`;
    frag.params.push(like, like, like, like);
  }

  return frag;
}

export function whereClause(frag: SqlFragment): string {
  return frag.where.length ? `WHERE ${frag.where.join(" AND ")}` : "";
}

/**
 * The audience for a campaign: the segment, narrowed to people whose LATEST
 * consent for this purpose is "granted".
 *
 * The consent join is not optional and not a parameter — there is no code path
 * in this application that mails a segment without it.
 */
export function buildAudienceQuery(
  segment: Segment,
  purpose: CampaignPurpose,
  today = new Date(),
): { sql: string; params: unknown[] } {
  const frag = buildPoolFilter(segment, today);
  // `verified_at` is the second half of the consent proof. Registration is a
  // public form, so a consent row on its own only shows that somebody typed an
  // address; the verification stamp shows that whoever owns that mailbox opened
  // the link we sent there. A campaign requires both.
  //
  // Appended to the fragment rather than to the SQL, so it cannot end up dangling
  // after an empty WHERE.
  frag.where.push("p.verified_at IS NOT NULL");
  const sql = `
    SELECT ct.id, ct.email, ct.first_name, ct.last_name
    FROM contacts ct
    JOIN profiles p ON p.contact_id = ct.id
    JOIN consent_current cc
      ON cc.contact_id = ct.id AND cc.purpose = ? AND cc.granted = 1
    ${whereClause(frag)}
    ORDER BY ct.last_name, ct.first_name
  `;
  return { sql, params: [purpose, ...frag.params] };
}
