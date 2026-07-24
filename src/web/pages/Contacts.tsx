import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  type ActivityEntry,
  type Consents,
  type ConsentRecord,
  type Contact,
  api,
} from "../api";
import {
  Banner,
  ConsentPill,
  Modal,
  STAGE_LABEL,
  Stat,
  StagePill,
  formatDate,
  humanizeToken,
  relativeDays,
} from "../components";

interface Stats {
  prospects: number;
  contacted: number;
  registered: number;
  suppressed: number;
  linkedinQueue: number;
}

/** The outreach CRM: who we know, how far we've gone, and what we may do next. */
export function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filters, setFilters] = useState({ stage: "", suppressed: "", search: "" });
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.stage) params.set("stage", filters.stage);
      if (filters.suppressed) params.set("suppressed", filters.suppressed);
      if (filters.search.trim()) params.set("search", filters.search.trim());
      const [list, s] = await Promise.all([
        api.get<{ total: number; contacts: Contact[] }>(`/api/contacts?${params}`),
        api.get<Stats>("/api/contacts/stats"),
      ]);
      setContacts(list.contacts);
      setStats(s);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <h1>Contacts</h1>
      <p>
        The full record for everyone we know of. Inviting people, the email wave and the LinkedIn
        queue all live on the <strong>Invitations</strong> screen — this is the address book and the
        history behind it.
      </p>

      {flash && <Banner kind={flash.kind}>{flash.text}</Banner>}

      <div className="stats">
        <Stat value={stats?.prospects ?? "—"} label="Prospects (opted out)" />
        <Stat value={stats?.contacted ?? "—"} label="Contacted, awaiting reply" tone="warn" />
        <Stat value={stats?.registered ?? "—"} label="Registered (opted in)" tone="good" />
        <Stat value={stats?.suppressed ?? "—"} label="Do not contact" tone="bad" />
      </div>

      <div className="card">
        <div className="filters">
          <input
            placeholder="Search name or email…"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            aria-label="Search contacts"
          />
          <select
            value={filters.stage}
            onChange={(e) => setFilters({ ...filters, stage: e.target.value })}
            aria-label="Stage"
          >
            <option value="">Stage: any</option>
            {Object.entries(STAGE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={filters.suppressed}
            onChange={(e) => setFilters({ ...filters, suppressed: e.target.value })}
            aria-label="Contactable"
          >
            <option value="">Contactable: any</option>
            <option value="0">Contactable</option>
            <option value="1">Do not contact</option>
          </select>
          <div className="spacer" />
          <button type="button" className="btn plain sm" onClick={() => setShowAdd(true)}>
            + Add contact
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setShowImport(true)}>
            Import CSV
          </button>
          <a className="btn plain sm" href="/api/contacts/export/csv">
            Export
          </a>
        </div>

        {loading ? (
          <div className="spinner">Loading contacts…</div>
        ) : contacts.length === 0 ? (
          <div className="empty">
            <h3>No contacts yet</h3>
            <p>Import a list or add someone by hand to start building the pool.</p>
          </div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Source</th>
                  <th>Stage</th>
                  <th>Consent</th>
                  <th>Touches</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((ct) => (
                  <tr key={ct.id}>
                    <td>
                      <button
                        type="button"
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          fontWeight: 650,
                          color: "var(--accent-deep)",
                        }}
                        onClick={() => setDetailId(ct.id)}
                      >
                        {`${ct.first_name} ${ct.last_name}`.trim() ||
                          ct.email ||
                          "LinkedIn contact"}
                      </button>
                      <div className="sub">
                        {ct.email ?? "LinkedIn only"}
                        {ct.linkedin_url ? " · LinkedIn" : ""}
                      </div>
                    </td>
                    <td className="sub">
                      {humanizeToken(ct.source)}
                      {ct.source_note ? <div className="sub">{ct.source_note}</div> : null}
                    </td>
                    <td>
                      <StagePill stage={ct.stage} />
                    </td>
                    <td>
                      <ConsentPill consents={ct.consents} suppressed={ct.suppressed} />
                    </td>
                    <td className="num tnum">
                      {ct.outreach_count}
                      <div className="sub">{relativeDays(ct.last_outreach_at)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailId && (
        <ContactDetail id={detailId} onClose={() => setDetailId(null)} onChanged={load} />
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={async (msg) => {
            setShowImport(false);
            setFlash({ kind: "ok", text: msg });
            await load();
          }}
        />
      )}
      {showAdd && (
        <AddModal
          onClose={() => setShowAdd(false)}
          onDone={async () => {
            setShowAdd(false);
            await load();
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------- detail view */

function ContactDetail({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<{
    contact: Contact & { internal_notes: string | null };
    profile: Record<string, unknown> | null;
    consents: Consents;
    consentHistory: ConsentRecord[];
    activity: ActivityEntry[];
  } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setData(await api.get(`/api/contacts/${id}`));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <Modal title="Contact" onClose={onClose}>
        <div className="spinner">Loading…</div>
      </Modal>
    );
  }

  const ct = data.contact;
  const name = `${ct.first_name} ${ct.last_name}`.trim() || ct.email || "LinkedIn-only contact";

  return (
    <Modal title={name} onClose={onClose}>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <StagePill stage={ct.stage} />
        <ConsentPill consents={data.consents} suppressed={ct.suppressed} />
        {ct.has_profile && <span className="pill accent">In the pool</span>}
      </div>

      <div className="tablewrap">
        <table>
          <tbody>
            <tr>
              <td style={{ width: "35%" }}>
                <strong>Email</strong>
              </td>
              <td>{ct.email}</td>
            </tr>
            {ct.linkedin_url && (
              <tr>
                <td>
                  <strong>LinkedIn</strong>
                </td>
                <td>
                  <a href={ct.linkedin_url} target="_blank" rel="noreferrer noopener">
                    {ct.linkedin_url}
                  </a>
                </td>
              </tr>
            )}
            <tr>
              <td>
                <strong>Source</strong>
              </td>
              <td>
                {humanizeToken(ct.source)}
                {ct.source_note ? ` — ${ct.source_note}` : ""}
              </td>
            </tr>
            <tr>
              <td>
                <strong>Outreach</strong>
              </td>
              <td>
                {ct.outreach_count} touch{ct.outreach_count === 1 ? "" : "es"} · last{" "}
                {relativeDays(ct.last_outreach_at)}
              </td>
            </tr>
            {ct.suppressed && (
              <tr>
                <td>
                  <strong>Suppressed</strong>
                </td>
                <td>{ct.suppressed_reason ?? "—"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="btn-row" style={{ margin: "14px 0" }}>
        <select
          value={ct.stage}
          onChange={async (e) => {
            await api.patch(`/api/contacts/${id}`, { stage: e.target.value });
            await load();
            await onChanged();
          }}
          aria-label="Stage"
          style={{ width: "auto" }}
        >
          {Object.entries(STAGE_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={ct.suppressed ? "btn plain sm" : "btn danger sm"}
          onClick={async () => {
            if (!ct.suppressed && !window.confirm(`Mark ${name} as do-not-contact?`)) return;
            await api.post(`/api/contacts/${id}/suppress`, { suppressed: !ct.suppressed });
            await load();
            await onChanged();
          }}
        >
          {ct.suppressed ? "Lift suppression" : "Do not contact"}
        </button>
        {ct.has_profile && (
          <a className="btn ghost sm" href={`/api/contacts/${id}/cv`}>
            Download CV
          </a>
        )}
      </div>

      <h3>Consent history</h3>
      {data.consentHistory.length === 0 ? (
        <p style={{ fontSize: 13.5 }}>
          No consent recorded — this person has never opted in, which is the default.
        </p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Purpose</th>
                <th>Decision</th>
                <th>Where</th>
              </tr>
            </thead>
            <tbody>
              {data.consentHistory.map((row, i) => (
                <tr key={`${row.created_at}-${i}`}>
                  <td className="sub">{formatDate(row.created_at)}</td>
                  <td>{row.purpose.replace(/_/g, " ")}</td>
                  <td>
                    <span className={`pill ${row.granted ? "good" : "neutral"}`}>
                      {row.granted ? "granted" : "withdrawn"}
                    </span>
                  </td>
                  <td className="sub">{humanizeToken(row.source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WhoAccessed contactId={id} />

      <h3 style={{ marginTop: 18 }}>Activity</h3>
      <div className="field" style={{ display: "flex", gap: 8 }}>
        <input
          placeholder="Add an internal note…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Internal note"
        />
        <button
          type="button"
          className="btn ghost sm"
          disabled={!note.trim()}
          onClick={async () => {
            await api.post(`/api/contacts/${id}/note`, { note: note.trim() });
            setNote("");
            await load();
          }}
        >
          Add
        </button>
      </div>
      <ul className="timeline">
        {data.activity.map((entry, i) => (
          <li key={`${entry.created_at}-${i}`}>
            {entry.summary}
            <time>{formatDate(entry.created_at)}</time>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/**
 * Who has seen this particular freelancer's file.
 *
 * The endpoint behind it is admin-only, so rather than thread the current user
 * down through the modal, the panel simply renders nothing when the request is
 * refused. A recruiter sees no empty section, and no failure either.
 */
function WhoAccessed({ contactId }: { contactId: string }) {
  const [entries, setEntries] = useState<
    { id: string; user_name: string; label: string; detail: string | null; created_at: string }[]
  >([]);
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    api
      .get<{ entries: typeof entries }>(`/api/admin/access-log?contactId=${contactId}`)
      .then((res) => setEntries(res.entries))
      .catch(() => setAllowed(false));
  }, [contactId]);

  if (!allowed || entries.length === 0) return null;

  return (
    <>
      <h3 style={{ marginTop: 18 }}>Who accessed this record</h3>
      <ul className="timeline">
        {entries.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.user_name || "(removed user)"}</strong> — {entry.label.toLowerCase()}
            {entry.detail ? ` (${entry.detail})` : ""}
            <time>{formatDate(entry.created_at)}</time>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ------------------------------------------------------------------ modals */

export function LinkedInModal({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<{
    contact: { name: string; linkedin_url: string | null };
    decision: { allowed: boolean; reason?: string };
    connectionNote: string;
    message: string;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<typeof data>(`/api/outreach/linkedin/${id}`)
      .then(setData)
      .catch(() => undefined);
  }, [id]);

  async function copy(text: string, which: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
    } catch {
      setCopied("Copy failed — select the text and copy it by hand.");
    }
  }

  return (
    <Modal title="LinkedIn message" onClose={onClose}>
      {!data ? (
        <div className="spinner">Loading…</div>
      ) : (
        <>
          {!data.decision.allowed && <Banner kind="warn">{data.decision.reason}</Banner>}
          <p style={{ fontSize: 13.5 }}>
            Copy this into LinkedIn and send it yourself, then mark it sent so the touch is counted.
          </p>

          <h3>Connection request note</h3>
          <pre className="msg">{data.connectionNote}</pre>
          <div className="btn-row" style={{ marginBottom: 16 }}>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => copy(data.connectionNote, "note")}
            >
              Copy note
            </button>
            {copied === "note" && <small>Copied.</small>}
          </div>

          <h3>Full message</h3>
          <pre className="msg">{data.message}</pre>
          <div className="btn-row">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => copy(data.message, "msg")}
            >
              Copy message
            </button>
            {data.contact.linkedin_url && (
              <a
                className="btn plain sm"
                href={data.contact.linkedin_url}
                target="_blank"
                rel="noreferrer noopener"
              >
                Open profile
              </a>
            )}
            <div className="spacer" />
            <button
              type="button"
              className="btn deep sm"
              onClick={async () => {
                await api.post(`/api/outreach/linkedin/${id}/sent`);
                await onChanged();
                onClose();
              }}
            >
              I've sent it
            </button>
          </div>
          {copied === "msg" && <small>Copied.</small>}
        </>
      )}
    </Modal>
  );
}

export function ImportModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const [csv, setCsv] = useState("");
  const [source, setSource] = useState("linkedin");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title="Import contacts" onClose={onClose}>
      <p style={{ fontSize: 13.5 }}>
        Paste a CSV or choose a file. Each row needs an <strong>Email</strong> or a{" "}
        <strong>LinkedIn</strong> URL — people with only a LinkedIn profile are imported too and
        reached through the LinkedIn queue. First name, Last name and Phone are picked up when
        present. Everyone lands as an opted-out prospect.
      </p>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="field">
        <label htmlFor="imp-file">CSV file</label>
        <input
          id="imp-file"
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setCsv(await file.text());
          }}
        />
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="imp-src">Where from</label>
          <select id="imp-src" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="linkedin">LinkedIn search</option>
            <option value="referral">Referral</option>
            <option value="event">Event</option>
            <option value="import">Other list</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="imp-note">
            Note <span className="hint">(shown on each contact)</span>
          </label>
          <input id="imp-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="imp-csv">…or paste it here</label>
        <textarea
          id="imp-csv"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="Email,First name,Last name&#10;jane@example.com,Jane,Dupont"
        />
      </div>

      <button
        type="button"
        className="btn deep"
        disabled={!csv.trim() || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await api.post<{
              imported: number;
              duplicates: number;
              suppressed: number;
              skipped: { line: number; reason: string }[];
            }>("/api/contacts/import", { csv, source, sourceNote: note || undefined });
            const parts = [`Imported ${res.imported} contact${res.imported === 1 ? "" : "s"}`];
            if (res.duplicates) parts.push(`${res.duplicates} already known`);
            if (res.suppressed) parts.push(`${res.suppressed} on the do-not-contact list`);
            if (res.skipped.length) parts.push(`${res.skipped.length} rows skipped`);
            await onDone(`${parts.join(", ")}.`);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Import failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Importing…" : "Import"}
      </button>
    </Modal>
  );
}

function AddModal({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [f, setF] = useState({
    email: "",
    first_name: "",
    last_name: "",
    linkedin_url: "",
    source: "linkedin",
    source_note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="Add a contact" onClose={onClose}>
      {error && <Banner kind="error">{error}</Banner>}
      <div className="grid2">
        <div className="field">
          <label htmlFor="a-fn">First name</label>
          <input
            id="a-fn"
            value={f.first_name}
            onChange={(e) => setF({ ...f, first_name: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="a-ln">Last name</label>
          <input
            id="a-ln"
            value={f.last_name}
            onChange={(e) => setF({ ...f, last_name: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="a-em">Email</label>
        <input
          id="a-em"
          type="email"
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="a-li">LinkedIn URL</label>
        <input
          id="a-li"
          value={f.linkedin_url}
          onChange={(e) => setF({ ...f, linkedin_url: e.target.value })}
        />
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="a-src">Where from</label>
          <select
            id="a-src"
            value={f.source}
            onChange={(e) => setF({ ...f, source: e.target.value })}
          >
            <option value="linkedin">LinkedIn</option>
            <option value="referral">Referral</option>
            <option value="event">Event</option>
            <option value="manual">Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="a-note">Note</label>
          <input
            id="a-note"
            value={f.source_note}
            onChange={(e) => setF({ ...f, source_note: e.target.value })}
          />
        </div>
      </div>
      <button
        type="button"
        className="btn deep"
        disabled={!f.email.trim() || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.post("/api/contacts", {
              ...f,
              source_note: f.source_note || undefined,
              linkedin_url: f.linkedin_url || undefined,
            });
            await onDone();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not add");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Adding…" : "Add contact"}
      </button>
    </Modal>
  );
}
