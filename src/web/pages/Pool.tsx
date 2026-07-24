import { useCallback, useEffect, useMemo, useState } from "react";
import { type PoolMember, type Taxonomy, api } from "../api";
import {
  AvailabilityPill,
  ConsentPill,
  type FilterOption,
  MultiFilter,
  StagePill,
  relativeDays,
} from "../components";
import {
  BELGIAN_REGIONS,
  GRADED_LANGUAGES,
  WORK_REGIMES,
  regimeLabel,
  regionLabel,
} from "../profileFields";

interface PoolStats {
  total: number;
  availableNow: number;
  availableSoon: number;
  stale: number;
}

/** Everything the pool can be narrowed by. Arrays are OR-within, AND-across. */
interface Filters {
  search: string;
  skills: string[];
  industries: string[];
  languages: string[];
  mobility: string[];
  workRegime: string[];
  availability: string[];
  availableWithinDays: number | null;
  staleDays: number | null;
  rateMax: string;
  minYears: string;
}

const EMPTY: Filters = {
  search: "",
  skills: [],
  industries: [],
  languages: [],
  mobility: [],
  workRegime: [],
  availability: [],
  availableWithinDays: null,
  staleDays: null,
  rateMax: "",
  minYears: "",
};

const SOON_DAYS = 90;
const STALE_DAYS = 180;

const AVAILABILITY_OPTIONS: FilterOption[] = [
  { value: "now", label: "Available now" },
  { value: "from_date", label: "From a date" },
  { value: "not_available", label: "Not available" },
];
const AVAILABILITY_LABEL: Record<string, string> = {
  now: "Available now",
  from_date: "From a date",
  not_available: "Not available",
};

const MOBILITY_OPTIONS: FilterOption[] = BELGIAN_REGIONS.map((r) => ({
  value: r.code,
  label: r.label,
}));
const REGIME_OPTIONS: FilterOption[] = WORK_REGIMES.map((r) => ({ value: r.code, label: r.label }));
const LANGUAGE_OPTIONS: FilterOption[] = GRADED_LANGUAGES.map((l) => ({
  value: l.key,
  label: l.label,
}));

/**
 * The pool table. Its filters are the same shape a campaign audience uses, so
 * "Email this segment" reaches exactly the people on screen — minus anyone who
 * has not consented, which the campaign screen states explicitly.
 */
export function Pool() {
  const [rows, setRows] = useState<PoolMember[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [tax, setTax] = useState<Taxonomy | null>(null);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState<Filters>(EMPTY);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (f.search.trim()) p.set("search", f.search.trim());
    if (f.skills.length) p.set("skills", f.skills.join(","));
    if (f.industries.length) p.set("industries", f.industries.join(","));
    if (f.languages.length) p.set("languages", f.languages.join(","));
    if (f.mobility.length) p.set("mobility", f.mobility.join(","));
    if (f.workRegime.length) p.set("workRegime", f.workRegime.join(","));
    if (f.availability.length) p.set("availability", f.availability.join(","));
    if (f.availableWithinDays) p.set("availableWithinDays", String(f.availableWithinDays));
    if (f.staleDays) p.set("staleDays", String(f.staleDays));
    if (f.rateMax) p.set("rateMax", f.rateMax);
    if (f.minYears) p.set("minYears", f.minYears);
    return p;
  }, [f]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.get<{ total: number; freelancers: PoolMember[] }>(
        `/api/pool?${params}`,
      );
      setRows(list.freelancers);
      setTotal(list.total);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api
      .get<PoolStats>("/api/pool/stats")
      .then(setStats)
      .catch(() => undefined);
    api
      .get<Taxonomy>("/api/public/taxonomy")
      .then(setTax)
      .catch(() => undefined);
  }, []);

  // The four cards double as quick filters over the availability / freshness
  // dimension. "Freelancers registered" is the resting state: no quick filter on.
  const quick = {
    now: f.availability.includes("now"),
    soon: f.availableWithinDays === SOON_DAYS,
    stale: f.staleDays === STALE_DAYS,
  };
  const noQuick = !quick.now && !quick.soon && !quick.stale;
  const clearQuick = () =>
    setF((p) => ({
      ...p,
      availability: p.availability.filter((a) => a !== "now"),
      availableWithinDays: null,
      staleDays: null,
    }));
  const toggleNow = () =>
    set(
      "availability",
      quick.now ? f.availability.filter((a) => a !== "now") : [...f.availability, "now"],
    );

  // A flat list of the active filters, each able to remove just itself.
  const summary = useMemo(() => {
    const items: { id: string; text: string; remove: () => void }[] = [];
    const removeFrom = (
      key: "skills" | "industries" | "languages" | "mobility" | "workRegime" | "availability",
      v: string,
    ) =>
      set(
        key,
        f[key].filter((x) => x !== v),
      );
    if (f.search.trim())
      items.push({ id: "search", text: `“${f.search.trim()}”`, remove: () => set("search", "") });
    for (const v of f.skills)
      items.push({ id: `sk:${v}`, text: `Skill: ${v}`, remove: () => removeFrom("skills", v) });
    for (const v of f.industries)
      items.push({
        id: `in:${v}`,
        text: `Industry: ${v}`,
        remove: () => removeFrom("industries", v),
      });
    for (const v of f.languages)
      items.push({
        id: `la:${v}`,
        text: `Language: ${v}`,
        remove: () => removeFrom("languages", v),
      });
    for (const v of f.mobility)
      items.push({
        id: `mo:${v}`,
        text: `Region: ${regionLabel(v)}`,
        remove: () => removeFrom("mobility", v),
      });
    for (const v of f.workRegime)
      items.push({
        id: `wr:${v}`,
        text: `Regime: ${regimeLabel(v)}`,
        remove: () => removeFrom("workRegime", v),
      });
    for (const v of f.availability)
      items.push({
        id: `av:${v}`,
        text: AVAILABILITY_LABEL[v] ?? v,
        remove: () => removeFrom("availability", v),
      });
    if (f.availableWithinDays)
      items.push({
        id: "soon",
        text: "Available within 3 months",
        remove: () => set("availableWithinDays", null),
      });
    if (f.staleDays)
      items.push({
        id: "stale",
        text: "Not confirmed in 6 months",
        remove: () => set("staleDays", null),
      });
    if (f.rateMax)
      items.push({ id: "rate", text: `≤ € ${f.rateMax}/day`, remove: () => set("rateMax", "") });
    if (f.minYears)
      items.push({ id: "years", text: `≥ ${f.minYears} yrs`, remove: () => set("minYears", "") });
    return items;
  }, [f]);

  const skillOptions: FilterOption[] = (tax?.skills ?? []).map((s) => ({ value: s, label: s }));
  const industryOptions: FilterOption[] = (tax?.industries ?? []).map((s) => ({
    value: s,
    label: s,
  }));

  return (
    <>
      <h1>Talent pool</h1>
      <p>Freelancers who registered themselves and agreed to be matched with missions.</p>

      <div className="kpis">
        <Kpi
          value={stats?.total ?? "—"}
          label="Freelancers registered"
          active={noQuick}
          onClick={clearQuick}
        />
        <Kpi
          value={stats?.availableNow ?? "—"}
          label="Available now"
          tone="good"
          active={quick.now}
          onClick={toggleNow}
        />
        <Kpi
          value={stats?.availableSoon ?? "—"}
          label="Available within 3 months"
          active={quick.soon}
          onClick={() => set("availableWithinDays", quick.soon ? null : SOON_DAYS)}
        />
        <Kpi
          value={stats?.stale ?? "—"}
          label="Not confirmed in 6 months"
          tone="warn"
          active={quick.stale}
          onClick={() => set("staleDays", quick.stale ? null : STALE_DAYS)}
        />
      </div>

      <div className="card">
        <div className="filter-bar">
          <input
            className="filter-search-main"
            placeholder="Search name, email or headline…"
            value={f.search}
            onChange={(e) => set("search", e.target.value)}
            aria-label="Search the pool"
          />
          <MultiFilter
            label="Skill"
            options={skillOptions}
            selected={f.skills}
            onChange={(v) => set("skills", v)}
            searchable
          />
          <MultiFilter
            label="Industry"
            options={industryOptions}
            selected={f.industries}
            onChange={(v) => set("industries", v)}
            searchable
          />
          <MultiFilter
            label="Language"
            options={LANGUAGE_OPTIONS}
            selected={f.languages}
            onChange={(v) => set("languages", v)}
          />
          <MultiFilter
            label="Region"
            options={MOBILITY_OPTIONS}
            selected={f.mobility}
            onChange={(v) => set("mobility", v)}
            searchable
          />
          <MultiFilter
            label="Regime"
            options={REGIME_OPTIONS}
            selected={f.workRegime}
            onChange={(v) => set("workRegime", v)}
          />
          <MultiFilter
            label="Availability"
            options={AVAILABILITY_OPTIONS}
            selected={f.availability}
            onChange={(v) => set("availability", v)}
          />
          <input
            type="number"
            className="filter-num"
            placeholder="Max rate"
            value={f.rateMax}
            onChange={(e) => set("rateMax", e.target.value)}
            aria-label="Maximum day rate"
          />
          <input
            type="number"
            className="filter-num"
            placeholder="Min years"
            value={f.minYears}
            onChange={(e) => set("minYears", e.target.value)}
            aria-label="Minimum years of experience"
          />
        </div>

        {summary.length > 0 && (
          <div className="filter-summary">
            <span className="fs-label">Filters</span>
            {summary.map((s) => (
              <button
                key={s.id}
                type="button"
                className="chip on"
                onClick={s.remove}
                title="Remove this filter"
              >
                {s.text}
                <span className="chip-x" aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
            <button type="button" className="linklike fs-clear" onClick={() => setF(EMPTY)}>
              Remove all filters
            </button>
          </div>
        )}

        <div className="pool-toolbar">
          <span className="muted">
            {loading ? "Loading…" : `${total} freelancer${total === 1 ? "" : "s"}`}
            {summary.length > 0 && !loading ? " match these filters" : ""}
          </span>
          <div className="spacer" />
          <a className="btn plain sm" href={`/api/pool/export/csv?${params}`}>
            Export CSV
          </a>
        </div>

        {loading ? (
          <div className="spinner">Loading the pool…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <h3>Nobody matches yet</h3>
            <p>
              {summary.length > 0
                ? "No freelancer matches these filters. Try removing one."
                : "No freelancer has registered yet. They appear here once they complete registration."}
            </p>
          </div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Freelancer</th>
                  <th>Skills</th>
                  <th className="num">Rate/day</th>
                  <th>Availability</th>
                  <th>Consent</th>
                  <th>CV</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{`${p.first_name} ${p.last_name}`.trim()}</strong>
                      <div className="sub">
                        {[
                          p.years_experience !== null ? `${p.years_experience} yrs` : null,
                          p.languages.join(" "),
                          p.mobility.length ? p.mobility.map(regionLabel).join(", ") : p.location,
                          p.remote_ok ? "remote ok" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {p.headline && <div className="sub">{p.headline}</div>}
                    </td>
                    <td>
                      {p.skills.slice(0, 3).join(", ")}
                      {p.skills.length > 3 ? ` +${p.skills.length - 3}` : ""}
                      {p.industries.length > 0 && (
                        <div className="sub">{p.industries.join(", ")}</div>
                      )}
                    </td>
                    <td className="num tnum">
                      {p.daily_rate !== null ? `€ ${p.daily_rate}` : "—"}
                    </td>
                    <td>
                      <AvailabilityPill availability={p.availability} from={p.available_from} />
                    </td>
                    <td>
                      <ConsentPill consents={p.consents} verified={p.verified} />
                    </td>
                    <td>
                      {p.cv_filename ? (
                        <a href={`/api/contacts/${p.id}/cv`}>Download</a>
                      ) : (
                        <span className="sub">—</span>
                      )}
                    </td>
                    <td className="sub">
                      {relativeDays(p.last_confirmed_at ?? p.updated_at)}
                      <div>
                        <StagePill stage={p.stage} />
                      </div>
                    </td>
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

/** A stat card that is also a toggle for the filter it represents. */
function Kpi({
  value,
  label,
  tone,
  active,
  onClick,
}: {
  value: number | string;
  label: string;
  tone?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`kpi ${active ? "on" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <div className="v" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </div>
      <div className="l">{label}</div>
    </button>
  );
}
