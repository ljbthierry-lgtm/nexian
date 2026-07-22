/**
 * The consent ledger.
 *
 * Rules this module exists to enforce:
 *   - consent is only ever APPENDED, never updated or deleted, so we can always
 *     show what a person agreed to, when, and against which policy version;
 *   - a contact with no rows is opted OUT — that is the default for everyone we
 *     add ourselves (imports, LinkedIn research, referrals);
 *   - only the freelancer can grant marketing consent, through the platform.
 */
import type { ConsentPurpose, Env } from "../env";
import { all, run, uid } from "./db";
import { logActivity } from "./activity";

export const ALL_PURPOSES: ConsentPurpose[] = ["data_processing", "mission_alerts", "news"];
export const MARKETING_PURPOSES: ConsentPurpose[] = ["mission_alerts", "news"];

export const PURPOSE_LABEL: Record<ConsentPurpose, string> = {
  data_processing: "Store my profile to match me with missions",
  mission_alerts: "Mission alerts",
  news: "Company news",
};

export type ConsentSource =
  "registration_form" | "profile_page" | "unsubscribe_link" | "admin" | "import_declared";

export interface ConsentInput {
  contactId: string;
  purpose: ConsentPurpose;
  granted: boolean;
  source: ConsentSource;
  ip?: string | null;
  userAgent?: string | null;
  /** Staff member's name when an admin acts on someone's behalf. */
  actor?: string | null;
}

/** Append one consent decision and mirror it into the activity trail. */
export async function recordConsent(env: Env, input: ConsentInput): Promise<void> {
  await run(
    env.DB,
    `INSERT INTO consents (id, contact_id, purpose, granted, source, policy_version, ip, user_agent, actor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uid(),
    input.contactId,
    input.purpose,
    input.granted ? 1 : 0,
    input.source,
    env.PRIVACY_POLICY_VERSION ?? "",
    input.ip ?? null,
    input.userAgent ?? null,
    input.actor ?? null,
  );
  await logActivity(env.DB, {
    contactId: input.contactId,
    kind: input.granted ? "consent_granted" : "consent_revoked",
    summary: `${input.granted ? "Granted" : "Withdrew"} consent: ${PURPOSE_LABEL[input.purpose]}`,
    detail: `source=${input.source} policy=${env.PRIVACY_POLICY_VERSION ?? ""}`,
  });
}

/** Record several decisions at once (the registration form posts all three). */
export async function recordConsents(
  env: Env,
  contactId: string,
  decisions: Partial<Record<ConsentPurpose, boolean>>,
  common: Omit<ConsentInput, "contactId" | "purpose" | "granted">,
): Promise<void> {
  for (const purpose of ALL_PURPOSES) {
    const granted = decisions[purpose];
    if (granted === undefined) continue;
    await recordConsent(env, { ...common, contactId, purpose, granted });
  }
}

export type ConsentState = Record<ConsentPurpose, boolean>;

const NO_CONSENT: ConsentState = {
  data_processing: false,
  mission_alerts: false,
  news: false,
};

/** Current decision per purpose. Absent rows mean "not granted", never "unknown". */
export async function currentConsents(db: D1Database, contactId: string): Promise<ConsentState> {
  const rows = await all<{ purpose: ConsentPurpose; granted: number }>(
    db,
    `SELECT purpose, granted FROM consent_current WHERE contact_id = ?`,
    contactId,
  );
  const state: ConsentState = { ...NO_CONSENT };
  for (const row of rows) state[row.purpose] = row.granted === 1;
  return state;
}

/** Same, for a page of contacts, to avoid a query per row. */
export async function consentsFor(
  db: D1Database,
  contactIds: string[],
): Promise<Map<string, ConsentState>> {
  const map = new Map<string, ConsentState>();
  if (!contactIds.length) return map;
  const placeholders = contactIds.map(() => "?").join(", ");
  const rows = await all<{ contact_id: string; purpose: ConsentPurpose; granted: number }>(
    db,
    `SELECT contact_id, purpose, granted FROM consent_current WHERE contact_id IN (${placeholders})`,
    ...contactIds,
  );
  for (const id of contactIds) map.set(id, { ...NO_CONSENT });
  for (const row of rows) {
    const state = map.get(row.contact_id);
    if (state) state[row.purpose] = row.granted === 1;
  }
  return map;
}

/** Full history, newest first — shown on the contact page and in a data export. */
export async function consentHistory(db: D1Database, contactId: string) {
  return all<{
    purpose: ConsentPurpose;
    granted: number;
    source: string;
    policy_version: string;
    created_at: string;
  }>(
    db,
    `SELECT purpose, granted, source, policy_version, created_at
     FROM consents WHERE contact_id = ? ORDER BY seq DESC`,
    contactId,
  );
}
