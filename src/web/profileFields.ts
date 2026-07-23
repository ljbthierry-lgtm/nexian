/**
 * Client mirror of the language-level and Belgian-region constants.
 *
 * The worker copy in src/worker/lib/profileFields.ts is the authority — it
 * validates what gets stored. These are the same small, stable lists for the
 * forms; test/profileFieldsParity.test.ts fails if the two ever diverge.
 */

export const LANGUAGE_LEVELS = ["native", "fluent", "good", "basic"] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

export const LANGUAGE_LEVEL_LABEL: Record<LanguageLevel, string> = {
  native: "Native / bilingual",
  fluent: "Fluent",
  good: "Good working knowledge",
  basic: "Basics",
};

export const GRADED_LANGUAGES = [
  { key: "French", label: "French" },
  { key: "Dutch", label: "Dutch" },
  { key: "English", label: "English" },
] as const;

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

/** Distinct group headers, in list order. */
export const REGION_GROUPS = ["Brussels", "Flanders", "Wallonia", "Remote"] as const;

export function regionLabel(code: string): string {
  return BELGIAN_REGIONS.find((r) => r.code === code)?.label ?? code;
}

export const WORK_REGIMES = [
  { code: "full_time", label: "Full-time" },
  { code: "part_time", label: "Part-time" },
] as const;

export function regimeLabel(code: string): string {
  return WORK_REGIMES.find((r) => r.code === code)?.label ?? code;
}

export const NOTICE_PERIODS = [
  { code: "immediate", label: "Immediately" },
  { code: "1_week", label: "Within 1 week" },
  { code: "2_weeks", label: "Within 2 weeks" },
  { code: "1_month", label: "1 month" },
  { code: "2_months", label: "2 months" },
  { code: "3_months_plus", label: "3 months or more" },
] as const;

export function noticeLabel(code: string | null): string {
  if (!code) return "";
  return NOTICE_PERIODS.find((n) => n.code === code)?.label ?? code;
}
