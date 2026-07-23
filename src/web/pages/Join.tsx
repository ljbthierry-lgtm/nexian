import { type FormEvent, useEffect, useState } from "react";
import { ApiError, type Availability, type Taxonomy, api } from "../api";
import { Banner, ChipPicker } from "../components";
import {
  BELGIAN_REGIONS,
  GRADED_LANGUAGES,
  LANGUAGE_LEVELS,
  LANGUAGE_LEVEL_LABEL,
  type LanguageLevel,
} from "../profileFields";

/**
 * The public registration form — the link we put in every outreach message.
 *
 * The three consent boxes start unticked and are never pre-selected. Only the
 * first is required; the two marketing ones are genuinely optional, which is
 * what makes the consent valid.
 */
interface PrefillResponse {
  valid: boolean;
  alreadyRegistered?: boolean;
  first_name?: string;
  email?: string | null;
  prefill?: {
    first_name: string;
    last_name: string;
    email: string | null;
    linkedin_url: string | null;
  };
}

/** The personalised-invitation token, read once from ?invite= in the URL. */
function inviteTokenFromUrl(): string | null {
  const token = new URLSearchParams(window.location.search).get("invite");
  return token && /^[0-9a-f]{64}$/.test(token) ? token : null;
}

export function Join() {
  const [tax, setTax] = useState<Taxonomy | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invite] = useState<string | null>(inviteTokenFromUrl);
  const [prefilled, setPrefilled] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    linkedin_url: "",
    headline: "",
    years_experience: "",
    years_relevant: "",
    daily_rate: "",
    availability: "now" as Availability,
    available_from: "",
    location: "",
    remote_ok: false,
    freelancer_note: "",
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [langLevels, setLangLevels] = useState<Record<string, LanguageLevel>>({});
  const [mobility, setMobility] = useState<string[]>([]);
  const [consent, setConsent] = useState({ data: false, alerts: false, news: false });

  const [cv, setCv] = useState<File | null>(null);

  const [linkEmail, setLinkEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);

  useEffect(() => {
    api
      .get<Taxonomy>("/api/public/taxonomy")
      .then(setTax)
      .catch(() => undefined);
  }, []);

  // Arrived through a personalised invitation: fill in what we already hold, so
  // they check and complete instead of retyping. A dead or foreign token
  // degrades silently to the blank form — the link must never scare anyone off.
  useEffect(() => {
    if (!invite) return;
    api
      .get<PrefillResponse>(`/api/public/join-prefill?token=${invite}`)
      .then((res) => {
        if (!res.valid) return;
        if (res.alreadyRegistered) {
          setAlreadyRegistered(true);
          if (res.email) setLinkEmail(res.email);
          return;
        }
        if (!res.prefill) return;
        setForm((f) => ({
          ...f,
          first_name: f.first_name || res.prefill!.first_name,
          last_name: f.last_name || res.prefill!.last_name,
          email: f.email || (res.prefill!.email ?? ""),
          linkedin_url: f.linkedin_url || (res.prefill!.linkedin_url ?? ""),
        }));
        setPrefilled(true);
      })
      .catch(() => undefined);
  }, [invite]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent.data) {
      setError("We can only store your profile if you agree to the first checkbox.");
      return;
    }
    setBusy(true);
    try {
      await api.register<{ ok: boolean }>(
        {
          email: form.email.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone: form.phone.trim() || undefined,
          linkedin_url: form.linkedin_url.trim() || undefined,
          headline: form.headline.trim() || undefined,
          years_experience: form.years_experience ? Number(form.years_experience) : undefined,
          years_relevant: form.years_relevant ? Number(form.years_relevant) : undefined,
          language_levels: langLevels,
          mobility,
          skills,
          industries,
          languages,
          daily_rate: form.daily_rate ? Number(form.daily_rate) : undefined,
          availability: form.availability,
          available_from: form.availability === "from_date" ? form.available_from : undefined,
          location: form.location.trim() || undefined,
          remote_ok: form.remote_ok,
          freelancer_note: form.freelancer_note.trim() || undefined,
          consent_data_processing: consent.data,
          consent_mission_alerts: consent.alerts,
          consent_news: consent.news,
          invite: invite ?? undefined,
        },
        cv,
      );

      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // One confirmation for every outcome. The server deliberately answers the same
  // way whether or not the address was already known, and this screen must not
  // undo that by saying something different.
  if (done) {
    return (
      <Shell>
        <h1>Check your inbox</h1>
        <div className="card">
          <p>
            Thanks. We have sent a link to <strong>{form.email.trim()}</strong> — open it to see
            your profile, change anything, or remove yourself.
          </p>
          <p>
            If a profile already existed for that address, the link opens it instead of creating a
            second one.
          </p>
          <p className="muted" style={{ fontSize: 13.5 }}>
            Nothing else to do. When a mission matches what you do, we will be in touch.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {prefilled && (
        <Banner kind="info">
          Welcome{form.first_name ? `, ${form.first_name}` : ""} — we've filled in what we already
          have. Please check it, complete the rest, and choose your preferences below. Nothing is
          saved until you submit.
        </Banner>
      )}
      {alreadyRegistered && (
        <Banner kind="info">
          You're already in our pool. Use the “Already registered?” box to get a secure link to your
          existing profile rather than creating a second one.
        </Banner>
      )}
      <div className="hero">
        <div>
          <div className="eyebrow">Freelance network</div>
          <h1>Join the {tax?.companyName ?? "Nexian"} freelance pool</h1>
          <p>
            We match experienced freelancers with missions at our clients. Tell us who you are once
            — then update your rate and availability whenever they change.
          </p>
          <ul className="hero-points">
            <li>About three minutes, no account or password needed</li>
            <li>You control your rate, availability and data at all times</li>
            <li>We only contact you about missions if you ask us to</li>
          </ul>
        </div>
        <div className="card">
          <h3>Already registered?</h3>
          <p style={{ fontSize: 13.5 }}>
            Enter your email and we'll send a secure link to update your profile.
          </p>
          {linkSent ? (
            <Banner kind="ok">If that address is in our pool, the link is on its way.</Banner>
          ) : (
            <>
              <div className="field">
                <label htmlFor="lk">Email</label>
                <input
                  id="lk"
                  type="email"
                  value={linkEmail}
                  onChange={(e) => setLinkEmail(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn ghost"
                style={{ width: "100%" }}
                onClick={async () => {
                  if (!linkEmail.trim()) return;
                  await api.post("/api/public/request-link", { email: linkEmail.trim() });
                  setLinkSent(true);
                }}
              >
                Email me my update link
              </button>
            </>
          )}
        </div>
      </div>

      <form className="card" onSubmit={submit}>
        <h2>Your profile</h2>
        {error && <Banner kind="error">{error}</Banner>}

        <div className="grid2">
          <div className="field">
            <label htmlFor="fn">First name</label>
            <input
              id="fn"
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="ln">Last name</label>
            <input
              id="ln"
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="em">Email</label>
            <input
              id="em"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="ph">
              Phone <span className="hint">(optional)</span>
            </label>
            <input id="ph" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="li">
              LinkedIn <span className="hint">(optional)</span>
            </label>
            <input
              id="li"
              value={form.linkedin_url}
              onChange={(e) => set("linkedin_url", e.target.value)}
            />
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="yr">Years of experience (total)</label>
            <input
              id="yr"
              type="number"
              min={0}
              max={70}
              value={form.years_experience}
              onChange={(e) => set("years_experience", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="yrr">
              Years of relevant experience{" "}
              <span className="hint">— in the kind of work you'd take on</span>
            </label>
            <input
              id="yrr"
              type="number"
              min={0}
              max={70}
              value={form.years_relevant}
              onChange={(e) => set("years_relevant", e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="hd">
            One line about you{" "}
            <span className="hint">— e.g. "Interim procurement manager, pharma"</span>
          </label>
          <input
            id="hd"
            value={form.headline}
            onChange={(e) => set("headline", e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="field">
          <label>
            Skills <span className="hint">— pick all that apply</span>
          </label>
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
          <p className="hint" style={{ margin: "0 0 8px" }}>
            Grade the three we work in. Leave a language blank if you don't use it.
          </p>
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
          <label style={{ marginTop: 12 }}>
            Other languages <span className="hint">(optional)</span>
          </label>
          <ChipPicker
            options={(tax?.languages ?? []).filter(
              (l) => !GRADED_LANGUAGES.some((g) => g.label === l),
            )}
            selected={languages}
            onChange={setLanguages}
            allowCustom
          />
        </div>

        <div className="field">
          <label>
            Where can you work? <span className="hint">— Belgian regions you'll travel to</span>
          </label>
          <div className="chips">
            {BELGIAN_REGIONS.map((region) => {
              const on = mobility.includes(region.code);
              return (
                <button
                  key={region.code}
                  type="button"
                  className={`chip ${on ? "on" : ""}`}
                  aria-pressed={on}
                  onClick={() =>
                    setMobility((prev) =>
                      prev.includes(region.code)
                        ? prev.filter((c) => c !== region.code)
                        : [...prev, region.code],
                    )
                  }
                >
                  {region.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="rate">
              Daily rate <span className="hint">(EUR, excl. VAT)</span>
            </label>
            <input
              id="rate"
              type="number"
              min={0}
              value={form.daily_rate}
              onChange={(e) => set("daily_rate", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="av">Availability</label>
            <select
              id="av"
              value={form.availability}
              onChange={(e) => set("availability", e.target.value as Availability)}
            >
              <option value="now">Available now</option>
              <option value="from_date">Available from a date</option>
              <option value="not_available">Not available for now</option>
            </select>
          </div>
          {form.availability === "from_date" && (
            <div className="field">
              <label htmlFor="af">Available from</label>
              <input
                id="af"
                type="date"
                value={form.available_from}
                onChange={(e) => set("available_from", e.target.value)}
                required
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="loc">
              Based in <span className="hint">(optional)</span>
            </label>
            <input
              id="loc"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </div>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={form.remote_ok}
            onChange={(e) => set("remote_ok", e.target.checked)}
          />
          <span>I'm open to fully remote missions</span>
        </label>

        <div className="field">
          <label htmlFor="cv">
            CV <span className="hint">— PDF or Word, up to 8 MB</span>
          </label>
          <input
            id="cv"
            type="file"
            accept=".pdf,.doc,.docx,application/pdf"
            onChange={(e) => setCv(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="field">
          <label htmlFor="note">
            Anything else we should know? <span className="hint">(optional)</span>
          </label>
          <textarea
            id="note"
            value={form.freelancer_note}
            onChange={(e) => set("freelancer_note", e.target.value)}
            maxLength={2000}
            style={{ minHeight: 90 }}
          />
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: "6px 0 14px" }}>
          <legend style={{ fontSize: 13, fontWeight: 650, padding: 0, marginBottom: 8 }}>
            Your choices
          </legend>
          <label className="check">
            <input
              type="checkbox"
              checked={consent.data}
              onChange={(e) => setConsent((c) => ({ ...c, data: e.target.checked }))}
            />
            <span>
              <strong>Required:</strong> I agree that {tax?.companyName ?? "Nexian"} stores my
              profile to match me with missions. I can view, change, download or delete it at any
              time.{" "}
              <a href="/privacy" target="_blank" rel="noreferrer">
                Privacy notice
              </a>
            </span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={consent.alerts}
              onChange={(e) => setConsent((c) => ({ ...c, alerts: e.target.checked }))}
            />
            <span>
              <strong>Optional:</strong> Send me mission alerts that match my profile, and remind me
              to keep my availability up to date.
            </span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={consent.news}
              onChange={(e) => setConsent((c) => ({ ...c, news: e.target.checked }))}
            />
            <span>
              <strong>Optional:</strong> Send me occasional company news (a few times a year).
            </span>
          </label>
        </fieldset>

        <button className="btn deep" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Submit my profile"}
        </button>
      </form>
    </Shell>
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
