import { useCallback, useEffect, useState } from "react";
import { ApiError, type Me, api } from "../api";
import { Banner, Stat, formatDate } from "../components";

interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "recruiter";
  active: number;
  has_password: number;
  created_at: string;
}

interface TaxonomyRow {
  id: string;
  kind: "skill" | "industry" | "language";
  label: string;
  sort: number;
  active: number;
}

/** Staff accounts, the picker lists, and the GDPR housekeeping controls. */
export function Settings({ me }: { me: Me }) {
  const [tab, setTab] = useState<"team" | "lists" | "privacy" | "access">("team");

  if (me.role !== "admin") {
    return (
      <>
        <h1>Settings</h1>
        <Banner kind="info">Only administrators can change settings.</Banner>
      </>
    );
  }

  return (
    <>
      <h1>Settings</h1>
      <div className="btn-row" style={{ marginBottom: 16 }}>
        {(["team", "lists", "privacy", "access"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "btn sm" : "btn plain sm"}
            onClick={() => setTab(key)}
          >
            {key === "team"
              ? "Team"
              : key === "lists"
                ? "Skills & industries"
                : key === "privacy"
                  ? "Privacy & retention"
                  : "Access log"}
          </button>
        ))}
      </div>

      {tab === "team" && <Team me={me} />}
      {tab === "lists" && <Lists />}
      {tab === "privacy" && <PrivacyOps />}
      {tab === "access" && <AccessLog />}
    </>
  );
}

function Team({ me }: { me: Me }) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [f, setF] = useState({ name: "", email: "", role: "recruiter" as "admin" | "recruiter" });
  const [flash, setFlash] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<{ users: StaffUser[] }>("/api/admin/users");
    setUsers(res.users);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      {flash && <Banner kind={flash.kind}>{flash.text}</Banner>}
      <div className="card">
        <h3>Team</h3>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    {u.id === me.id && <span className="sub">that's you</span>}
                  </td>
                  <td className="sub">{u.email}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={u.id === me.id}
                      onChange={async (e) => {
                        try {
                          await api.patch(`/api/admin/users/${u.id}`, { role: e.target.value });
                          await load();
                        } catch (err) {
                          setFlash({
                            kind: "error",
                            text:
                              err instanceof ApiError ? err.message : "Could not change the role",
                          });
                        }
                      }}
                      style={{ width: "auto" }}
                      aria-label={`Role for ${u.name}`}
                    >
                      <option value="recruiter">Recruiter</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    {u.active ? (
                      u.has_password ? (
                        <span className="pill good">Active</span>
                      ) : (
                        <span className="pill warn">Invited</span>
                      )
                    ) : (
                      <span className="pill neutral">Disabled</span>
                    )}
                  </td>
                  <td className="sub">{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Invite someone</h3>
        <p style={{ fontSize: 13.5 }}>
          They receive an email with a link to choose their own password.
        </p>
        <div className="grid3">
          <div className="field">
            <label htmlFor="u-name">Name</label>
            <input
              id="u-name"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="u-email">Email</label>
            <input
              id="u-email"
              type="email"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="u-role">Role</label>
            <select
              id="u-role"
              value={f.role}
              onChange={(e) => setF({ ...f, role: e.target.value as "admin" | "recruiter" })}
            >
              <option value="recruiter">Recruiter</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          className="btn deep"
          disabled={!f.name.trim() || !f.email.trim()}
          onClick={async () => {
            try {
              const res = await api.post<{ invitationSent: boolean; setPasswordUrl?: string }>(
                "/api/admin/users",
                f,
              );
              setF({ name: "", email: "", role: "recruiter" });
              await load();
              setFlash(
                res.invitationSent
                  ? { kind: "ok", text: "Invitation sent." }
                  : {
                      kind: "warn",
                      text: `Account created, but email is not configured yet. Send them this link: ${res.setPasswordUrl}`,
                    },
              );
            } catch (err) {
              setFlash({
                kind: "error",
                text: err instanceof ApiError ? err.message : "Could not create the account",
              });
            }
          }}
        >
          Send invitation
        </button>
      </div>

      <ChangePassword />
    </>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [flash, setFlash] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  return (
    <div className="card">
      <h3>Your password</h3>
      {flash && <Banner kind={flash.kind}>{flash.text}</Banner>}
      <div className="grid2">
        <div className="field">
          <label htmlFor="pw-cur">Current password</label>
          <input
            id="pw-cur"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="pw-new">
            New password <span className="hint">— at least 10 characters</span>
          </label>
          <input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
      </div>
      <button
        type="button"
        className="btn ghost"
        disabled={!current || next.length < 10}
        onClick={async () => {
          try {
            await api.post("/api/auth/change-password", { current, next });
            setCurrent("");
            setNext("");
            setFlash({ kind: "ok", text: "Password changed." });
          } catch (err) {
            setFlash({
              kind: "error",
              text: err instanceof ApiError ? err.message : "Could not change the password",
            });
          }
        }}
      >
        Change password
      </button>
    </div>
  );
}

function Lists() {
  const [rows, setRows] = useState<TaxonomyRow[]>([]);
  const [f, setF] = useState({ kind: "skill" as TaxonomyRow["kind"], label: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<{ taxonomy: TaxonomyRow[] }>("/api/admin/taxonomy");
    setRows(res.taxonomy);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="card">
        <h3>Skills, industries and languages</h3>
        <p style={{ fontSize: 13.5 }}>
          These drive the pickers on the registration form. Switching one off hides it from new
          registrations without touching anyone who already chose it.
        </p>
        {error && <Banner kind="error">{error}</Banner>}
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <select
            value={f.kind}
            onChange={(e) => setF({ ...f, kind: e.target.value as TaxonomyRow["kind"] })}
            style={{ width: "auto" }}
            aria-label="List"
          >
            <option value="skill">Skill</option>
            <option value="industry">Industry</option>
            <option value="language">Language</option>
          </select>
          <input
            placeholder="New entry…"
            value={f.label}
            onChange={(e) => setF({ ...f, label: e.target.value })}
            style={{ width: "auto", minWidth: 220 }}
            aria-label="New entry"
          />
          <button
            type="button"
            className="btn ghost sm"
            disabled={!f.label.trim()}
            onClick={async () => {
              setError(null);
              try {
                await api.post("/api/admin/taxonomy", { kind: f.kind, label: f.label.trim() });
                setF({ ...f, label: "" });
                await load();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Could not add");
              }
            }}
          >
            Add
          </button>
        </div>

        {(["skill", "industry", "language"] as const).map((kind) => (
          <div key={kind} style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, textTransform: "capitalize" }}>{kind}s</h3>
            <div className="chips">
              {rows
                .filter((r) => r.kind === kind)
                .map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="chip"
                    aria-pressed={r.active === 1}
                    title={r.active ? "Click to hide from the form" : "Click to show on the form"}
                    onClick={async () => {
                      await api.patch(`/api/admin/taxonomy/${r.id}`, { active: r.active !== 1 });
                      await load();
                    }}
                  >
                    {r.label}
                    {r.active !== 1 ? " (hidden)" : ""}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function PrivacyOps() {
  const [retention, setRetention] = useState<{
    retentionDays: number;
    count: number;
    sample: { email: string; added: string }[];
  } | null>(null);
  const [suppression, setSuppression] = useState<{ total: number } | null>(null);
  const [emails, setEmails] = useState<
    {
      to_email: string;
      template: string;
      status: string;
      created_at: string;
      error: string | null;
    }[]
  >([]);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, s, e] = await Promise.all([
      api.get<typeof retention>("/api/admin/retention/preview"),
      api.get<{ total: number }>("/api/admin/suppression"),
      api.get<{ emails: typeof emails }>("/api/admin/email-log"),
    ]);
    setRetention(r);
    setSuppression(s);
    setEmails(e.emails);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      {flash && <Banner kind="ok">{flash}</Banner>}

      <div className="grid2">
        <div className="card">
          <h3>Retention</h3>
          <p style={{ fontSize: 13.5 }}>
            Prospects who never registered are anonymised automatically after{" "}
            {retention?.retentionDays ?? "—"} days. Their consent and activity trail is kept as
            proof that we contacted them lawfully and then cleaned up.
          </p>
          <p style={{ fontSize: 13.5 }}>
            <strong>{retention?.count ?? 0}</strong> record{retention?.count === 1 ? "" : "s"} are
            due right now.
          </p>
          <button
            type="button"
            className="btn ghost sm"
            disabled={!retention?.count}
            onClick={async () => {
              const res = await api.post<{ anonymised: number }>("/api/admin/retention/run");
              setFlash(`Anonymised ${res.anonymised} record${res.anonymised === 1 ? "" : "s"}.`);
              await load();
            }}
          >
            Run the sweep now
          </button>
        </div>

        <div className="card">
          <h3>Do-not-contact list</h3>
          <p style={{ fontSize: 13.5 }}>
            <strong>{suppression?.total ?? 0}</strong> address
            {suppression?.total === 1 ? "" : "es"} can never be contacted again. They are stored as
            hashes, so the list survives deletion and blocks re-imports without keeping any readable
            address.
          </p>
        </div>
      </div>

      <div className="card">
        <h3>Recent email</h3>
        {emails.length === 0 ? (
          <p style={{ fontSize: 13.5 }}>Nothing sent yet.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>To</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {emails.slice(0, 40).map((row, i) => (
                  <tr key={`${row.created_at}-${i}`}>
                    <td className="sub">{row.to_email}</td>
                    <td className="sub">{row.template}</td>
                    <td>
                      <span className={`pill ${row.status === "sent" ? "good" : "bad"}`}>
                        {row.status}
                      </span>
                      {row.error && <div className="sub">{row.error.slice(0, 80)}</div>}
                    </td>
                    <td className="sub">{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Who read personal data.
 *
 * The activity trail on a contact records changes; this records reads, which is
 * what a quiet breach actually looks like — nobody edits anything, somebody just
 * downloads every CV on their way out the door.
 */
interface AccessEntry {
  id: string;
  user_id: string | null;
  user_name: string;
  action: string;
  label: string;
  detail: string | null;
  whose: string;
  ip: string | null;
  created_at: string;
}

interface AccessLogData {
  entries: AccessEntry[];
  staff: { user_id: string; user_name: string }[];
  last30Days: { cvDownloads: number; bulkExports: number; staffActive: number };
}

const ACCESS_FILTERS = [
  { value: "", label: "Everything" },
  { value: "cv_download", label: "CV downloads" },
  { value: "pool_export", label: "Pool exports" },
  { value: "contacts_export", label: "Contact exports" },
  { value: "access_log_export", label: "Exports of this log" },
];

function AccessLog() {
  const [data, setData] = useState<AccessLogData | null>(null);
  const [filters, setFilters] = useState({ userId: "", action: "", from: "", to: "" });

  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== "")).toString();

  useEffect(() => {
    void api.get<AccessLogData>(`/api/admin/access-log${query ? `?${query}` : ""}`).then(setData);
  }, [query]);

  if (!data) return <p className="sub">Loading…</p>;

  return (
    <>
      <div className="stats">
        <Stat value={data.last30Days.cvDownloads} label="CVs downloaded (30 days)" />
        <Stat value={data.last30Days.bulkExports} label="Bulk exports (30 days)" tone="amber" />
        <Stat value={data.last30Days.staffActive} label="Staff who accessed data" />
      </div>

      <div className="card">
        <h3>Who read what</h3>
        <p className="sub">
          Every CV download and every export, newest first. This log cannot be edited or deleted
          from inside the application, including by an administrator, and an entry outlives both the
          freelancer whose record it names and the colleague who made it.
        </p>

        <div className="filters">
          <select
            value={filters.userId}
            onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
            aria-label="Filter by staff member"
          >
            <option value="">Anyone</option>
            {data.staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.user_name}
              </option>
            ))}
          </select>
          <select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            aria-label="Filter by what happened"
          >
            {ACCESS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            aria-label="From date"
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            aria-label="To date"
          />
          <a className="btn plain sm" href={`/api/admin/access-log/export/csv?${query}`}>
            Export as CSV
          </a>
        </div>

        {data.entries.length === 0 ? (
          <p className="sub">
            Nothing matches. No CV or export has been downloaded{query ? " with these filters" : ""}
            .
          </p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Who</th>
                  <th>What</th>
                  <th>Whose record</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((row) => (
                  <tr key={row.id}>
                    <td>{row.user_name || "(removed user)"}</td>
                    <td>
                      {row.label}
                      {row.detail && <div className="sub">{row.detail}</div>}
                    </td>
                    <td className="sub">{row.whose || "—"}</td>
                    <td className="sub">{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
