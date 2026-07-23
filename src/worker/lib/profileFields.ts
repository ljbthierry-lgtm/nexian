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
 * The Belgian regions, for mobility — where a freelancer will physically work.
 * The three official regions, matching how clients describe a site's location.
 * (Provinces would be finer; kept to regions unless the business wants more.)
 */
export const BELGIAN_REGIONS = [
  { code: "brussels", label: "Brussels-Capital" },
  { code: "flanders", label: "Flanders" },
  { code: "wallonia", label: "Wallonia" },
] as const;

export type RegionCode = (typeof BELGIAN_REGIONS)[number]["code"];

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
