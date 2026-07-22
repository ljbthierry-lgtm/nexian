import { useCallback, useEffect, useState } from "react";
import { ApiError, type Availability, type Consents, type Taxonomy, api } from "../api";
import { AvailabilityPill, Banner, ChipPicker, formatDate, relativeDays } from "../components";

interface PortalProfile {
  headline: string;
  years_experience: number | null;
  skills: string[];
  industries: string[];
  languages: string[];
  daily_rate: number | null;
  currency: string;
  availability: Availability;
  available_from: string | null;
  location: string | null;
  remote_ok: boolean;
  freelancer_note: string | null;
  cv_filename: string | null;
  cv_size: number | null;
  cv_uploaded_at: string | null;
  registered_at: string;
  updated_at: string;
  last_confirmed_at: string | null;
}

interface PortalMe {
  contact: { id: string; email: string; first_name: string; last_name: string };
  profile: PortalProfile;
  consents: Consents;
}

/** The freelancer's own page, reached from a magic link. */
export function Portal() {
  const [data, setData] = useState<PortalMe | null>(null);
  const [tax, setTax] = useState<Taxonomy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get<PortalMe>("/api/portal/me"));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your profile");
    }
  }, []);

  useEffect(() => {
    void load();
    api
      .get<Taxonomy>("/api/public/taxonomy")
      .then(setTax)
      .catch(() => undefined);
  }, [load]);

  if (error) {
    return (
      <Shell>
        <h1>Your link has expired</h1>
        <div className="card">
          <p>{error}</p>
          <p>Links in our emails are personal and time-limited. You can request a fresh one.</p>
          <a className="btn" href="/join">
            Request a new link
          </a>
        </div>
      </Shell>
    );
  }

  if (!data) return <div className="spinner">Loading your profile…</div>;
  const { contact, profile, consents } = data;

  async function patch(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await api.patch("/api/portal/profile", body);
      await load();
      setFlash(message);
    } catch (err) {
      setFlash(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="eyebrow">Your profile</div>
      <h1>Welcome back, {contact.first_name || contact.email}</h1>
      <p>
        Last updated {relativeDays(profile.updated_at)}. Keeping your availability current means we
        can match you faster.
      </p>

      {flash && <Banner kind="ok">{flash}</Banner>}

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Availability</h3>
            <div style={{ marginTop: 4 }}>
              <AvailabilityPill availability={profile.availability} from={profile.available_from} />
              {profile.daily_rate !== null && (
                <span className="muted" style={{ marginLeft: 10, fontSize: 13.5 }}>
                  € {profile.daily_rate}/day
                </span>
              )}
            </div>
          </div>
          <div className="spacer" />
          <div className="btn-row">
            <button
              type="button"
              className="btn good"
              disabled={busy}
              onClick={() =>
                patch(
                  { availability: "now", available_from: null },
                  "You're marked as available now.",
                )
              }
            >
              I'm available now
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Change
            </button>
          </div>
        </div>
        <small>
          Last confirmed{" "}
          {profile.last_confirmed_at ? relativeDays(profile.last_confirmed_at) : "never"}.
        </small>
      </div>

      {editing ? (
        <EditForm
          profile={profile}
          contact={contact}
          tax={tax}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            await patch(body, "Your profile has been updated.");
            setEditing(false);
          }}
        />
      ) : (
        <div className="card">
          <div className="card-head">
            <h3>Profile summary</h3>
            <div className="spacer" />
            <button type="button" className="btn ghost sm" onClick={() => setEditing(true)}>
              Edit
            </button>
          </div>
          <div className="tablewrap">
            <table>
              <tbody>
                <Row label="Name">{`${contact.first_name} ${contact.last_name}`.trim() || "—"}</Row>
                <Row label="Email">{contact.email}</Row>
                <Row label="Headline">{profile.headline || "—"}</Row>
                <Row label="Experience">
                  {profile.years_experience !== null ? `${profile.years_experience} years` : "—"}
                </Row>
                <Row label="Day rate">
                  {profile.daily_rate !== null ? `€ ${profile.daily_rate}` : "—"}
                </Row>
                <Row label="Skills">{profile.skills.join(" · ") || "—"}</Row>
                <Row label="Industries">{profile.industries.join(" · ") || "—"}</Row>
                <Row label="Languages">{profile.languages.join(" · ") || "—"}</Row>
                <Row label="Based in">
                  {profile.location || "—"}
                  {profile.remote_ok ? " · open to remote" : ""}
                </Row>
                <Row label="Registered">{formatDate(profile.registered_at)}</Row>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CvCard profile={profile} onChanged={load} />

      <div className="card">
        <h3>Email preferences</h3>
        <p style={{ fontSize: 13.5 }}>
          Change these whenever you like. Turning both off keeps your profile in the pool — we just
          won't email you.
        </p>
        <ConsentToggle
          label="Mission alerts and availability reminders"
          granted={consents.mission_alerts}
          purpose="mission_alerts"
          onDone={load}
        />
        <ConsentToggle
          label="Occasional company news"
          granted={consents.news}
          purpose="news"
          onDone={load}
        />
      </div>

      <div className="card">
        <h3>Your data</h3>
        <p style={{ fontSize: 13.5 }}>
          You can download everything we hold about you, or remove yourself completely. Deleting is
          immediate and cannot be undone.
        </p>
        <div className="btn-row">
          <a className="btn ghost" href="/api/portal/export">
            Download my data
          </a>
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (
                !window.confirm(
                  "Delete your profile and CV? This is immediate and cannot be undone. We will not contact you again.",
                )
              )
                return;
              await api.post("/api/portal/delete");
              window.location.href = "/join";
            }}
          >
            Delete my profile
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td style={{ width: "34%" }}>
        <strong>{label}</strong>
      </td>
      <td>{children}</td>
    </tr>
  );
}

function ConsentToggle({
  label,
  granted,
  purpose,
  onDone,
}: {
  label: string;
  granted: boolean;
  purpose: "mission_alerts" | "news";
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={granted}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          try {
            await api.post("/api/portal/consent", { purpose, granted: e.target.checked });
            await onDone();
          } finally {
            setBusy(false);
          }
        }}
      />
      <span>{label}</span>
    </label>
  );
}

function CvCard({
  profile,
  onChanged,
}: {
  profile: PortalProfile;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card">
      <h3>CV</h3>
      {error && <Banner kind="error">{error}</Banner>}
      {profile.cv_filename ? (
        <p style={{ fontSize: 13.5 }}>
          <strong>{profile.cv_filename}</strong> — uploaded {formatDate(profile.cv_uploaded_at)}
          {profile.cv_size ? ` · ${(profile.cv_size / 1024).toFixed(0)} KB` : ""}
        </p>
      ) : (
        <p style={{ fontSize: 13.5 }}>No CV on file yet.</p>
      )}
      <div className="btn-row">
        {profile.cv_filename && (
          <a className="btn ghost sm" href="/api/portal/cv">
            Download
          </a>
        )}
        <label className="btn ghost sm" style={{ cursor: "pointer" }}>
          {profile.cv_filename ? "Replace" : "Upload"}
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf"
            style={{ display: "none" }}
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setError(null);
              try {
                await api.upload("/api/portal/cv", file);
                await onChanged();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Upload failed");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {profile.cv_filename && (
          <button
            type="button"
            className="btn plain sm"
            disabled={busy}
            onClick={async () => {
              await api.del("/api/portal/cv");
              await onChanged();
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function EditForm({
  profile,
  contact,
  tax,
  busy,
  onSave,
  onCancel,
}: {
  profile: PortalProfile;
  contact: { first_name: string; last_name: string };
  tax: Taxonomy | null;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    first_name: contact.first_name,
    last_name: contact.last_name,
    headline: profile.headline,
    years_experience: profile.years_experience?.toString() ?? "",
    daily_rate: profile.daily_rate?.toString() ?? "",
    // "unknown" only exists for legacy rows; the form always offers a real choice.
    availability: (profile.availability === "unknown" ? "now" : profile.availability) as
      "now" | "from_date" | "not_available",
    available_from: profile.available_from ?? "",
    location: profile.location ?? "",
    remote_ok: profile.remote_ok,
    freelancer_note: profile.freelancer_note ?? "",
  });
  const [skills, setSkills] = useState(profile.skills);
  const [industries, setIndustries] = useState(profile.industries);
  const [languages, setLanguages] = useState(profile.languages);

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({
          first_name: f.first_name,
          last_name: f.last_name,
          headline: f.headline,
          years_experience: f.years_experience ? Number(f.years_experience) : null,
          daily_rate: f.daily_rate ? Number(f.daily_rate) : null,
          availability: f.availability,
          available_from: f.availability === "from_date" ? f.available_from || null : null,
          location: f.location || null,
          remote_ok: f.remote_ok,
          freelancer_note: f.freelancer_note || null,
          skills,
          industries,
          languages,
        });
      }}
    >
      <h3>Edit your profile</h3>
      <div className="grid2">
        <div className="field">
          <label htmlFor="e-fn">First name</label>
          <input
            id="e-fn"
            value={f.first_name}
            onChange={(e) => setF({ ...f, first_name: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="e-ln">Last name</label>
          <input
            id="e-ln"
            value={f.last_name}
            onChange={(e) => setF({ ...f, last_name: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="e-yr">Years of experience</label>
          <input
            id="e-yr"
            type="number"
            min={0}
            max={70}
            value={f.years_experience}
            onChange={(e) => setF({ ...f, years_experience: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="e-rate">Daily rate (EUR)</label>
          <input
            id="e-rate"
            type="number"
            min={0}
            value={f.daily_rate}
            onChange={(e) => setF({ ...f, daily_rate: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="e-av">Availability</label>
          <select
            id="e-av"
            value={f.availability}
            onChange={(e) =>
              setF({ ...f, availability: e.target.value as "now" | "from_date" | "not_available" })
            }
          >
            <option value="now">Available now</option>
            <option value="from_date">Available from a date</option>
            <option value="not_available">Not available for now</option>
          </select>
        </div>
        {f.availability === "from_date" && (
          <div className="field">
            <label htmlFor="e-af">Available from</label>
            <input
              id="e-af"
              type="date"
              value={f.available_from}
              onChange={(e) => setF({ ...f, available_from: e.target.value })}
              required
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="e-loc">Based in</label>
          <input
            id="e-loc"
            value={f.location}
            onChange={(e) => setF({ ...f, location: e.target.value })}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="e-hd">Headline</label>
        <input
          id="e-hd"
          value={f.headline}
          onChange={(e) => setF({ ...f, headline: e.target.value })}
        />
      </div>

      <div className="field">
        <label>Skills</label>
        <ChipPicker
          options={tax?.skills ?? []}
          selected={skills}
          onChange={setSkills}
          allowCustom
        />
      </div>
      <div className="field">
        <label>Industries</label>
        <ChipPicker
          options={tax?.industries ?? []}
          selected={industries}
          onChange={setIndustries}
          allowCustom
        />
      </div>
      <div className="field">
        <label>Languages</label>
        <ChipPicker
          options={tax?.languages ?? []}
          selected={languages}
          onChange={setLanguages}
          allowCustom
        />
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={f.remote_ok}
          onChange={(e) => setF({ ...f, remote_ok: e.target.checked })}
        />
        <span>I'm open to fully remote missions</span>
      </label>

      <div className="field">
        <label htmlFor="e-note">Anything else we should know?</label>
        <textarea
          id="e-note"
          value={f.freelancer_note}
          onChange={(e) => setF({ ...f, freelancer_note: e.target.value })}
          style={{ minHeight: 90 }}
        />
      </div>

      <div className="btn-row">
        <button className="btn deep" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button className="btn plain" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="public">
      <div className="public-inner">
        <img className="public-logo" src="/logo.png" alt="Nexian" />
        {children}
      </div>
    </div>
  );
}
