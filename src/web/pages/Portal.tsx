import { useCallback, useEffect, useState } from "react";
import { ApiError, type Availability, type Consents, type Taxonomy, api } from "../api";
import {
  AvailabilityPill,
  Banner,
  MobilityPicker,
  SearchSelect,
  formatDate,
  relativeDays,
} from "../components";
import {
  BELGIAN_REGIONS,
  REGION_GROUPS,
  GRADED_LANGUAGES,
  LANGUAGE_LEVELS,
  LANGUAGE_LEVEL_LABEL,
  type LanguageLevel,
  NOTICE_PERIODS,
  WORK_REGIMES,
  noticeLabel,
  regimeLabel,
  regionLabel,
} from "../profileFields";

interface PortalProfile {
  headline: string;
  years_experience: number | null;
  years_relevant: number | null;
  skills: string[];
  industries: string[];
  languages: string[];
  language_levels: Record<string, LanguageLevel>;
  mobility: string[];
  work_regime: string[];
  notice_period: string | null;
  certifications: string[];
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

/**
 * Sample data for the staff-side preview: what a registered freelancer's page
 * looks like, without touching any real freelancer's record.
 */
const PREVIEW_DATA: PortalMe = {
  contact: {
    id: "preview",
    email: "sofie.vermeulen@example.com",
    first_name: "Sofie",
    last_name: "Vermeulen",
  },
  profile: {
    headline: "Senior project manager — pharma & manufacturing",
    years_experience: 12,
    years_relevant: 8,
    skills: ["Project management", "Change management", "Procurement"],
    industries: ["Pharma & life sciences", "Manufacturing"],
    languages: ["Dutch", "French", "English"],
    language_levels: { Dutch: "native", French: "fluent", English: "good" },
    mobility: ["brussels", "flanders"],
    work_regime: ["full_time", "part_time"],
    notice_period: "1_month",
    certifications: ["PMP (Project Management Professional)", "Prosci / ADKAR Change Management"],
    daily_rate: 750,
    currency: "EUR",
    availability: "from_date",
    available_from: "2026-09-01",
    location: "Brussels",
    remote_ok: true,
    freelancer_note: null,
    cv_filename: "CV_Sofie_Vermeulen.pdf",
    cv_size: 245760,
    cv_uploaded_at: "2026-05-12 09:30:00",
    registered_at: "2026-05-12 09:24:00",
    updated_at: "2026-07-01 14:02:00",
    last_confirmed_at: "2026-07-01 14:02:00",
  },
  consents: { data_processing: true, mission_alerts: true, news: false },
};

/**
 * The freelancer's own page, reached from a magic link — or, with `preview`,
 * the staff-side look at that page rendered from sample data. Preview mode
 * never fetches `/api/portal/me` and every write is disabled at the submit
 * boundary, so an admin can show the experience around without a session or a
 * guinea-pig freelancer.
 */
export function Portal({ preview = false }: { preview?: boolean }) {
  const [data, setData] = useState<PortalMe | null>(preview ? PREVIEW_DATA : null);
  const [tax, setTax] = useState<Taxonomy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (preview) return;
    try {
      setData(await api.get<PortalMe>("/api/portal/me"));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your profile");
    }
  }, [preview]);

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
    // The single choke point every profile save goes through, so preview mode
    // is read-only by construction rather than by remembering to disable
    // buttons one by one.
    if (preview) {
      setFlash("This is a preview — nothing is saved.");
      return;
    }
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
      {preview && (
        <Banner kind="info">
          Preview — this is what a registered freelancer sees. Buttons are disabled and nothing is
          saved.
        </Banner>
      )}
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
                  {profile.years_relevant !== null ? ` · ${profile.years_relevant} relevant` : ""}
                </Row>
                <Row label="Day rate">
                  {profile.daily_rate !== null ? `€ ${profile.daily_rate}` : "—"}
                </Row>
                <Row label="Skills">{profile.skills.join(" · ") || "—"}</Row>
                <Row label="Industries">{profile.industries.join(" · ") || "—"}</Row>
                <Row label="Languages">
                  {Object.keys(profile.language_levels ?? {}).length
                    ? GRADED_LANGUAGES.filter((g) => profile.language_levels?.[g.key])
                        .map((g) => `${g.label}: ${profile.language_levels[g.key]}`)
                        .join(" · ")
                    : profile.languages.join(" · ") || "—"}
                </Row>
                <Row label="Mobility">
                  {profile.mobility?.length ? profile.mobility.map(regionLabel).join(" · ") : "—"}
                </Row>
                <Row label="Work regime">
                  {profile.work_regime?.length
                    ? profile.work_regime.map(regimeLabel).join(" · ")
                    : "—"}
                </Row>
                <Row label="Notice period">{noticeLabel(profile.notice_period) || "—"}</Row>
                <Row label="Certifications">{profile.certifications?.join(" · ") || "—"}</Row>
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

      <CvCard profile={profile} onChanged={load} readOnly={preview} />

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
          readOnly={preview}
        />
        <ConsentToggle
          label="Occasional company news"
          granted={consents.news}
          purpose="news"
          onDone={load}
          readOnly={preview}
        />
      </div>

      <div className="card">
        <h3>Your data</h3>
        <p style={{ fontSize: 13.5 }}>
          You can download everything we hold about you, or remove yourself completely. Deleting is
          immediate and cannot be undone.
        </p>
        <div className="btn-row">
          <a
            className="btn ghost"
            href={preview ? undefined : "/api/portal/export"}
            aria-disabled={preview}
            onClick={preview ? (e) => e.preventDefault() : undefined}
          >
            Download my data
          </a>
          <button
            type="button"
            className="btn danger"
            disabled={preview}
            onClick={async () => {
              if (preview) return;
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
  readOnly = false,
}: {
  label: string;
  granted: boolean;
  purpose: "mission_alerts" | "news";
  onDone: () => Promise<void>;
  readOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={granted}
        disabled={busy || readOnly}
        onChange={async (e) => {
          if (readOnly) return;
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
  readOnly = false,
}: {
  profile: PortalProfile;
  onChanged: () => Promise<void>;
  readOnly?: boolean;
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
          <a
            className="btn ghost sm"
            href={readOnly ? undefined : "/api/portal/cv"}
            aria-disabled={readOnly}
            onClick={readOnly ? (e) => e.preventDefault() : undefined}
          >
            Download
          </a>
        )}
        <label className="btn ghost sm" style={{ cursor: readOnly ? "default" : "pointer" }}>
          {profile.cv_filename ? "Replace" : "Upload"}
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf"
            style={{ display: "none" }}
            disabled={busy || readOnly}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || readOnly) return;
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
            disabled={busy || readOnly}
            onClick={async () => {
              if (readOnly) return;
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
    years_relevant: profile.years_relevant?.toString() ?? "",
    daily_rate: profile.daily_rate?.toString() ?? "",
    // "unknown" only exists for legacy rows; the form always offers a real choice.
    availability: (profile.availability === "unknown" ? "now" : profile.availability) as
      "now" | "from_date" | "not_available",
    available_from: profile.available_from ?? "",
    notice_period: profile.notice_period ?? "",
    location: profile.location ?? "",
    freelancer_note: profile.freelancer_note ?? "",
  });
  const [skills, setSkills] = useState(profile.skills);
  const [industries, setIndustries] = useState(profile.industries);
  const gradedKeys = new Set<string>(GRADED_LANGUAGES.map((g) => g.key));
  const [languages, setLanguages] = useState(profile.languages.filter((l) => !gradedKeys.has(l)));
  const [langLevels, setLangLevels] = useState<Record<string, LanguageLevel>>(
    profile.language_levels ?? {},
  );
  const [mobility, setMobility] = useState<string[]>(profile.mobility ?? []);
  const [workRegime, setWorkRegime] = useState<string[]>(profile.work_regime ?? []);
  const [certifications, setCertifications] = useState<string[]>(profile.certifications ?? []);

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
          years_relevant: f.years_relevant ? Number(f.years_relevant) : null,
          daily_rate: f.daily_rate ? Number(f.daily_rate) : null,
          availability: f.availability,
          available_from: f.availability === "from_date" ? f.available_from || null : null,
          location: f.location || null,
          freelancer_note: f.freelancer_note || null,
          skills,
          industries,
          languages,
          language_levels: langLevels,
          mobility,
          work_regime: workRegime,
          notice_period: f.notice_period || null,
          certifications,
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
          <label htmlFor="e-yr">Years of experience (total)</label>
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
          <label htmlFor="e-yrr">Years of relevant experience</label>
          <input
            id="e-yrr"
            type="number"
            min={0}
            max={70}
            value={f.years_relevant}
            onChange={(e) => setF({ ...f, years_relevant: e.target.value })}
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
        <SearchSelect
          options={tax?.skills ?? []}
          selected={skills}
          onChange={setSkills}
          allowCustom
          placeholder="Search skills…"
        />
      </div>
      <div className="field">
        <label>Industries</label>
        <SearchSelect
          options={tax?.industries ?? []}
          selected={industries}
          onChange={setIndustries}
          placeholder="Search industries…"
        />
      </div>
      <div className="field">
        <label>Certifications</label>
        <SearchSelect
          options={tax?.certifications ?? []}
          selected={certifications}
          onChange={setCertifications}
          allowCustom
          placeholder="Search certifications…"
        />
      </div>
      <div className="field">
        <label>Languages</label>
        <div className="lang-grid">
          {GRADED_LANGUAGES.map((lang) => (
            <div key={lang.key} className="lang-row">
              <span className="lang-name">{lang.label}</span>
              <select
                aria-label={`${lang.label} level`}
                value={langLevels[lang.key] ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setLangLevels((prev) => {
                    const next = { ...prev };
                    if (v) next[lang.key] = v as LanguageLevel;
                    else delete next[lang.key];
                    return next;
                  });
                }}
              >
                <option value="">Not applicable</option>
                {LANGUAGE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {LANGUAGE_LEVEL_LABEL[level]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <label style={{ marginTop: 12 }}>Other languages</label>
        <SearchSelect
          options={(tax?.languages ?? []).filter(
            (l) => !GRADED_LANGUAGES.some((g) => g.label === l),
          )}
          selected={languages}
          onChange={setLanguages}
          allowCustom
          placeholder="Search languages…"
        />
      </div>

      <div className="field">
        <label>Where can you work?</label>
        <MobilityPicker
          areas={BELGIAN_REGIONS}
          groups={REGION_GROUPS}
          selected={mobility}
          onChange={setMobility}
        />
      </div>

      <div className="grid2">
        <div className="field">
          <label>Work regime</label>
          <div className="chips">
            {WORK_REGIMES.map((r) => {
              const on = workRegime.includes(r.code);
              return (
                <button
                  key={r.code}
                  type="button"
                  className={`chip ${on ? "on" : ""}`}
                  aria-pressed={on}
                  onClick={() =>
                    setWorkRegime((prev) =>
                      prev.includes(r.code) ? prev.filter((c) => c !== r.code) : [...prev, r.code],
                    )
                  }
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="field">
          <label htmlFor="e-notice">Notice period</label>
          <select
            id="e-notice"
            value={f.notice_period}
            onChange={(e) => setF({ ...f, notice_period: e.target.value })}
          >
            <option value="">Prefer not to say</option>
            {NOTICE_PERIODS.map((n) => (
              <option key={n.code} value={n.code}>
                {n.label}
              </option>
            ))}
          </select>
        </div>
      </div>

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
