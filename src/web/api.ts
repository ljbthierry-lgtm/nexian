/** Typed fetch wrapper — the only place HTTP happens on the client. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    let code = "error";
    let message = `Request failed (${res.status})`;
    if (ct.includes("application/json")) {
      const data = (await res.json()) as { error?: string; message?: string };
      code = data.error ?? code;
      message = data.message ?? message;
    }
    throw new ApiError(res.status, code, message);
  }
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

async function sendForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, { method: "POST", credentials: "same-origin", body: form });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ApiError(res.status, data.error ?? "error", data.message ?? "Upload failed");
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  async upload<T>(path: string, file: File): Promise<T> {
    const form = new FormData();
    form.append("file", file);
    return sendForm<T>(path, form);
  },
  /**
   * Registration, with the CV in the same request. It travels here rather than
   * in a follow-up call because the follow-up would need a session, and the
   * server deliberately does not hand one out to an unverified caller.
   */
  async register<T>(profile: unknown, cv: File | null): Promise<T> {
    const form = new FormData();
    form.append("profile", JSON.stringify(profile));
    if (cv) form.append("cv", cv);
    return sendForm<T>("/api/public/register", form);
  },
};

/* ------------------------------------------------------------------ types */

export type Stage = "prospect" | "contacted" | "registered" | "vetted" | "on_mission" | "closed";
export type Availability = "now" | "from_date" | "not_available" | "unknown";

export interface Me {
  id: string;
  email: string;
  name: string;
  role: "admin" | "recruiter";
}

export interface Consents {
  data_processing: boolean;
  mission_alerts: boolean;
  news: boolean;
}

export interface InviteStatus {
  key:
    | "registered"
    | "declined"
    | "invited_2"
    | "invited_1"
    | "queued_linkedin"
    | "not_invited"
    | "no_channel";
  label: string;
  tone: "good" | "warn" | "neutral" | "bad";
}

export interface Contact {
  id: string;
  /** Null for LinkedIn-only prospects. */
  email: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  linkedin_url: string | null;
  linkedin_key: string | null;
  source: string;
  source_note: string | null;
  stage: Stage;
  suppressed: boolean;
  suppressed_reason: string | null;
  outreach_count: number;
  last_outreach_at: string | null;
  linkedin_state: "none" | "queued" | "sent";
  has_profile: boolean;
  created_at: string;
  consents?: Consents;
  invite_status: InviteStatus;
  /** 'unknown' | 'delivered' | 'bounced' | 'complained' */
  email_status: string;
  replied_at: string | null;
  reply_outcome: string | null;
}

export interface PoolMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  stage: Stage;
  headline: string;
  years_experience: number | null;
  skills: string[];
  industries: string[];
  languages: string[];
  mobility: string[];
  work_regime: string[];
  notice_period: string | null;
  years_relevant: number | null;
  daily_rate: number | null;
  currency: string;
  availability: Availability;
  available_from: string | null;
  location: string | null;
  remote_ok: boolean;
  cv_filename: string | null;
  updated_at: string;
  last_confirmed_at: string | null;
  /** The address was proven by opening an emailed link; campaigns require it. */
  verified: boolean;
  consents?: Consents;
}

export interface Taxonomy {
  skills: string[];
  industries: string[];
  languages: string[];
  certifications: string[];
  policyVersion: string;
  companyName: string;
}

export interface ActivityEntry {
  kind: string;
  summary: string;
  detail: string | null;
  created_at: string;
}

export interface ConsentRecord {
  purpose: keyof Consents;
  granted: number;
  source: string;
  policy_version: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  purpose: "mission_alerts" | "news";
  status: "draft" | "sending" | "sent";
  created_at: string;
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
  created_by_name?: string | null;
}
