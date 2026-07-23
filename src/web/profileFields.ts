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
  { code: "brussels", label: "Brussels-Capital" },
  { code: "flanders", label: "Flanders" },
  { code: "wallonia", label: "Wallonia" },
] as const;

export function regionLabel(code: string): string {
  return BELGIAN_REGIONS.find((r) => r.code === code)?.label ?? code;
}
