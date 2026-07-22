/** Typed Worker environment. Secrets come from `wrangler secret` / .dev.vars — never from code. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV: string;
  BASE_URL: string;
  EMAIL_FROM: string;
  COMPANY_NAME: string;
  PRIVACY_POLICY_VERSION: string;
  MAX_OUTREACH_TOUCHES: string;
  FOLLOWUP_AFTER_DAYS: string;
  AVAILABILITY_REMINDER_DAYS: string;
  PROSPECT_RETENTION_DAYS: string;
  // secrets
  RESEND_API_KEY?: string;
  /** Signing secret for Resend's delivery webhooks (`whsec_…`). */
  RESEND_WEBHOOK_SECRET?: string;
  SETUP_KEY?: string;
}

export type Role = "admin" | "recruiter";

/** The three things a freelancer can separately say yes or no to. */
export type ConsentPurpose = "data_processing" | "mission_alerts" | "news";

/** Marketing purposes only — `data_processing` is never a mailing audience. */
export type CampaignPurpose = Extract<ConsentPurpose, "mission_alerts" | "news">;

export type Stage = "prospect" | "contacted" | "registered" | "vetted" | "on_mission" | "closed";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Identity of a freelancer inside their own profile portal (magic-link session). */
export interface PortalContact {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

/** Hono context variable typing. */
export type AppContext = {
  Bindings: Env;
  Variables: { user: SessionUser; contact: PortalContact };
};

/** Numeric env var with a safe fallback — a typo in wrangler.toml must not send 500 emails. */
export function intVar(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
