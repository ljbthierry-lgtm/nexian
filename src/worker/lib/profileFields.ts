/**
 * The structured profile fields added after launch: language proficiency,
 * relevant experience, and mobility across the Belgian regions.
 *
 * Pure and shared, so the public registration form and the freelancer's own
 * portal validate identical shapes and the pool filter reads the same codes —
 * three definitions of "a valid language level" would drift within a week.
 */

/** From most to least — a simple scale, its own words: fluent down to basics. */
export const LANGUAGE_LEVELS = ["native", "fluent", "good", "basic"] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

export const LANGUAGE_LEVEL_LABEL: Record<LanguageLevel, string> = {
  native: "Native / bilingual",
  fluent: "Fluent",
  good: "Good working knowledge",
  basic: "Basics",
};

/** The pool's three working languages, graded individually. */
export const GRADED_LANGUAGES = [
  { key: "French", label: "French" },
  { key: "Dutch", label: "Dutch" },
  { key: "English", label: "English" },
] as const;

export function isLanguageLevel(value: unknown): value is LanguageLevel {
  return typeof value === "string" && (LANGUAGE_LEVELS as readonly string[]).includes(value);
}

/**
 * Keep only recognised language→level pairs. A level a form should never have
 * sent is dropped rather than stored, so the column can be trusted downstream.
 */
export function cleanLanguageLevels(input: unknown): Record<string, LanguageLevel> {
  const out: Record<string, LanguageLevel> = {};
  if (!input || typeof input !== "object") return out;
  const known = new Set<string>(GRADED_LANGUAGES.map((g) => g.key));
  for (const [lang, level] of Object.entries(input as Record<string, unknown>)) {
    if (known.has(lang) && isLanguageLevel(level)) out[lang] = level;
  }
  return out;
}

/**
 * The flat `languages` array the pool filter matches on, derived from the
 * grades plus any free-form extras. Deriving it means "speaks French" and
 * "French: fluent" can never disagree — the second is the source of the first.
 */
export function languagesFromLevels(
  levels: Record<string, LanguageLevel>,
  extras: string[] = [],
): string[] {
  const out = new Set<string>(Object.keys(levels));
  for (const extra of extras) {
    const trimmed = extra.trim();
    if (trimmed) out.add(trimmed);
  }
  return [...out];
}

/**
 * Where a freelancer will work: the Belgian provinces (Flanders and Wallonia are
 * too large to match a client site usefully), Brussels, and "Fully remote" —
 * which is a mobility answer as much as a place, so it lives in the same list.
 * `group` drives the headers on the form.
 */
export const BELGIAN_REGIONS = [
  { code: "brussels", label: "Brussels-Capital", group: "Brussels" },
  { code: "antwerp", label: "Antwerp", group: "Flanders" },
  { code: "east_flanders", label: "East Flanders", group: "Flanders" },
  { code: "west_flanders", label: "West Flanders", group: "Flanders" },
  { code: "flemish_brabant", label: "Flemish Brabant", group: "Flanders" },
  { code: "limburg", label: "Limburg", group: "Flanders" },
  { code: "walloon_brabant", label: "Walloon Brabant", group: "Wallonia" },
  { code: "hainaut", label: "Hainaut", group: "Wallonia" },
  { code: "liege", label: "Liège", group: "Wallonia" },
  { code: "luxembourg", label: "Luxembourg", group: "Wallonia" },
  { code: "namur", label: "Namur", group: "Wallonia" },
  { code: "remote", label: "Fully remote", group: "Remote" },
] as const;

export type RegionCode = (typeof BELGIAN_REGIONS)[number]["code"];

/** True when the person's mobility includes fully-remote work. */
export function mobilityHasRemote(mobility: string[]): boolean {
  return mobility.includes("remote");
}

const REGION_CODES = new Set(BELGIAN_REGIONS.map((r) => r.code));

export function cleanMobility(input: unknown): RegionCode[] {
  if (!Array.isArray(input)) return [];
  const out: RegionCode[] = [];
  for (const code of input) {
    if (
      typeof code === "string" &&
      REGION_CODES.has(code as RegionCode) &&
      !out.includes(code as RegionCode)
    ) {
      out.push(code as RegionCode);
    }
  }
  return out;
}

export function regionLabel(code: string): string {
  return BELGIAN_REGIONS.find((r) => r.code === code)?.label ?? code;
}

/** Work regime — a freelancer may offer both. */
export const WORK_REGIMES = [
  { code: "full_time", label: "Full-time" },
  { code: "part_time", label: "Part-time" },
] as const;

export type WorkRegime = (typeof WORK_REGIMES)[number]["code"];

const REGIME_CODES = new Set(WORK_REGIMES.map((r) => r.code));

export function cleanWorkRegime(input: unknown): WorkRegime[] {
  if (!Array.isArray(input)) return [];
  const out: WorkRegime[] = [];
  for (const code of input) {
    if (
      typeof code === "string" &&
      REGIME_CODES.has(code as WorkRegime) &&
      !out.includes(code as WorkRegime)
    ) {
      out.push(code as WorkRegime);
    }
  }
  return out;
}

export function regimeLabel(code: string): string {
  return WORK_REGIMES.find((r) => r.code === code)?.label ?? code;
}

/** How soon a freelancer can start once engaged — their current commitment. */
export const NOTICE_PERIODS = [
  { code: "immediate", label: "Immediately" },
  { code: "1_week", label: "Within 1 week" },
  { code: "2_weeks", label: "Within 2 weeks" },
  { code: "1_month", label: "1 month" },
  { code: "2_months", label: "2 months" },
  { code: "3_months_plus", label: "3 months or more" },
] as const;

export type NoticePeriod = (typeof NOTICE_PERIODS)[number]["code"];

const NOTICE_CODES = new Set(NOTICE_PERIODS.map((n) => n.code));

/** A recognised code, or null — an unknown value is not stored. */
export function cleanNoticePeriod(input: unknown): NoticePeriod | null {
  return typeof input === "string" && NOTICE_CODES.has(input as NoticePeriod)
    ? (input as NoticePeriod)
    : null;
}

export function noticeLabel(code: string | null): string {
  if (!code) return "";
  return NOTICE_PERIODS.find((n) => n.code === code)?.label ?? code;
}
