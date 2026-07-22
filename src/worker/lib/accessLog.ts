/**
 * A record of who READ personal data.
 *
 * The activity trail already covers changes. This covers the other half, which
 * is what a breach actually looks like from the inside: nobody edits anything,
 * somebody just downloads every CV and every day rate on their way out.
 *
 * Writing this must never break the download it describes, so failures are
 * logged and swallowed — with one deliberate exception noted on `recordAccess`.
 */
import { run, uid } from "./db";
import { log } from "./log";

export type AccessAction = "cv_download" | "pool_export" | "contacts_export";

export interface AccessEntry {
  userId: string | null;
  /** Copied in, so removing a leaver cannot blank their download history. */
  userName: string;
  action: AccessAction;
  contactId?: string | null;
  detail?: string | null;
  ip?: string | null;
}

export async function recordAccess(db: D1Database, entry: AccessEntry): Promise<void> {
  try {
    await run(
      db,
      `INSERT INTO access_log (id, user_id, user_name, action, contact_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      uid(),
      entry.userId,
      entry.userName,
      entry.action,
      entry.contactId ?? null,
      entry.detail ?? null,
      entry.ip ?? null,
    );
  } catch (e) {
    // Deliberate: a download is not blocked because its audit row failed. The
    // failure is loud in the logs instead, because a silent gap in an access log
    // is worse than no access log at all — it looks like nothing happened.
    log.error("access_log.write_failed", {
      action: entry.action,
      user: entry.userId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Human-readable summary of one row, shared by the admin screen and any export. */
export const ACCESS_LABEL: Record<AccessAction, string> = {
  cv_download: "Downloaded a CV",
  pool_export: "Exported the talent pool",
  contacts_export: "Exported the contact list",
};
