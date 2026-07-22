/**
 * Skills, industries and languages are stored as a JSON array of labels in a
 * single TEXT column, and every module that reads a profile has to turn that
 * back into a list.
 *
 * It lives here because three copies of "parse this column" is three chances to
 * disagree about what a malformed value means — and the answer has to be the
 * same everywhere: an unreadable column is an empty list, never an exception
 * that takes down the pool screen.
 */

export function parseLabels(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
  } catch {
    return [];
  }
}

export function serialiseLabels(labels: string[]): string {
  return JSON.stringify(labels.map((l) => l.trim()).filter((l) => l.length > 0));
}
