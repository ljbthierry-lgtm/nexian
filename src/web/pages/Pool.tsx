import { useCallback, useEffect, useState } from "react";
import { type PoolMember, type Taxonomy, api } from "../api";
import { AvailabilityPill, ConsentPill, Stat, StagePill, relativeDays } from "../components";

interface PoolStats {
  total: number;
  availableNow: number;
  availableSoon: number;
  stale: number;
}

/**
 * The pool table. Its filters are the same shape a campaign audience uses, so
 * "Email this segment" reaches exactly the people on screen — minus anyone who
 * has not consented, which the campaign screen states explicitly.
 */
export function Pool() {
  const [rows, setRows] = useState<PoolMember[]>([]);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [tax, setTax] = useState<Taxonomy | null>(null);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({
    search: "",
    skill: "",
    industry: "",
    availability: "",
    rateMax: "",
    minYears: "",
  });

  const query = useCallback(() => {
    const params = new URLSearchParams();
    if (f.search.trim()) params.set("search", f.search.trim());
    if (f.skill) params.set("skills", f.skill);
    if (f.industry) params.set("industries", f.industry);
    if (f.availability) params.set("availability", f.availability);
    if (f.rateMax) params.set("rateMax", f.rateMax);
    if (f.minYears) params.set("minYears", f.minYears);
    return params;
  }, [f]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        api.get<{ total: number; freelancers: PoolMember[] }>(`/api/pool?${query()}`),
        api.get<PoolStats>("/api/pool/stats"),
      ]);
      setRows(list.freelancers);
      setStats(s);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api
      .get<Taxonomy>("/api/public/taxonomy")
      .then(setTax)
      .catch(() => undefined);
  }, []);

  return (
    <>
      <h1>Talent pool</h1>
      <p>Freelancers who registered themselves and agreed to be matched with missions.</p>

      <div className="stats">
        <Stat value={stats?.total ?? "—"} label="Freelancers registered" />
        <Stat value={stats?.availableNow ?? "—"} label="Available now" tone="good" />
        <Stat value={stats?.availableSoon ?? "—"} label="Available within 3 months" />
        <Stat value={stats?.stale ?? "—"} label="Not confirmed in 6 months" tone="warn" />
      </div>

      <div className="card">
        <div className="filters">
          <input
            placeholder="Search name, email or headline…"
            value={f.search}
            onChange={(e) => setF({ ...f, search: e.target.value })}
            aria-label="Search the pool"
          />
          <select
            value={f.skill}
            onChange={(e) => setF({ ...f, skill: e.target.value })}
            aria-label="Skill"
          >
            <option value="">Skill: any</option>
            {tax?.skills.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={f.industry}
            onChange={(e) => setF({ ...f, industry: e.target.value })}
            aria-label="Industry"
          >
            <option value="">Industry: any</option>
            {tax?.industries.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={f.availability}
            onChange={(e) => setF({ ...f, availability: e.target.value })}
            aria-label="Availability"
          >
            <option value="">Availability: any</option>
            <option value="now">Available now</option>
            <option value="from_date">From a date</option>
            <option value="not_available">Not available</option>
          </select>
          <input
            type="number"
            placeholder="Max rate"
            value={f.rateMax}
            onChange={(e) => setF({ ...f, rateMax: e.target.value })}
            aria-label="Maximum day rate"
            style={{ maxWidth: 110 }}
          />
          <input
            type="number"
            placeholder="Min years"
            value={f.minYears}
            onChange={(e) => setF({ ...f, minYears: e.target.value })}
            aria-label="Minimum years of experience"
            style={{ maxWidth: 110 }}
          />
          <div className="spacer" />
          <a className="btn plain sm" href={`/api/pool/export/csv?${query()}`}>
            Export CSV
          </a>
        </div>

        {loading ? (
          <div className="spinner">Loading the pool…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <h3>Nobody matches yet</h3>
            <p>
              Either no freelancer has registered with these criteria, or the filters are too
              narrow.
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
                          p.location,
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
                      <ConsentPill consents={p.consents} />
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
