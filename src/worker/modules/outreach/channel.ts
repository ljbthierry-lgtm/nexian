/**
 * Which channel works a prospect who can be reached both ways.
 *
 * A single global preference — email or LinkedIn — decides the FIRST touch for
 * anyone who has both an address and a LinkedIn profile, with the other channel
 * as an automatic fallback: prefer email, but someone with no usable address
 * (none on file, or it bounced / drew a complaint) still surfaces in the
 * LinkedIn queue, and vice versa. The two-touch cap and every hard stop are
 * untouched by this — it only routes, it never widens.
 *
 * Encoded twice on purpose: SQL fragments for the selects that build the wave,
 * the follow-up job and the LinkedIn queue, and `pickChannel` for the unit test
 * that proves the two agree.
 */
import { first, run } from "../../lib/db";

export type ChannelPriority = "email" | "linkedin";
const KEY = "outreach_channel_priority";

export async function readChannelPriority(db: D1Database): Promise<ChannelPriority> {
  const row = await first<{ value: string }>(db, `SELECT value FROM settings WHERE key = ?`, KEY);
  return row?.value === "linkedin" ? "linkedin" : "email";
}

export async function writeChannelPriority(db: D1Database, value: ChannelPriority): Promise<void> {
  await run(
    db,
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    KEY,
    value === "linkedin" ? "linkedin" : "email",
  );
}

/**
 * WHERE fragment over `contacts ct` keeping only people whose channel is email.
 * When LinkedIn is preferred, email is just the fallback for those with no
 * profile; when email is preferred it keeps everyone (the emailable filter has
 * already run alongside it).
 */
export function emailChannelSql(preferred: ChannelPriority): string {
  return preferred === "linkedin" ? "AND (ct.linkedin_url IS NULL OR ct.linkedin_url = '')" : "";
}

/**
 * WHERE fragment over `contacts ct` keeping only people whose channel is
 * LinkedIn. When email is preferred, LinkedIn is the fallback for those we
 * cannot email; when LinkedIn is preferred it keeps everyone with a profile.
 */
export function linkedinChannelSql(preferred: ChannelPriority): string {
  return preferred === "email"
    ? "AND (ct.email IS NULL OR ct.email_status IN ('bounced', 'complained'))"
    : "";
}

/** The channel one person gets — the same rule the SQL fragments encode. */
export function pickChannel(
  who: { emailable: boolean; hasLinkedin: boolean },
  preferred: ChannelPriority,
): "email" | "linkedin" | "none" {
  if (preferred === "email") {
    if (who.emailable) return "email";
    return who.hasLinkedin ? "linkedin" : "none";
  }
  if (who.hasLinkedin) return "linkedin";
  return who.emailable ? "email" : "none";
}
