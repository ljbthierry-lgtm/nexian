import { useCallback, useEffect, useState } from "react";
import { ApiError, type Campaign, type Taxonomy, api } from "../api";
import { Banner, Modal, formatDate } from "../components";

interface Preview {
  eligible: number;
  matchingSegment: number;
  excludedForConsent: number;
  sample: { name: string; email: string }[];
}

/** Compose a campaign, see exactly who it reaches, then send. */
export function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [composing, setComposing] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<{ campaigns: Campaign[] }>("/api/campaigns");
    setCampaigns(res.campaigns);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <h1>Campaigns</h1>
      <p>
        News and mission alerts go only to freelancers who ticked that box themselves. The audience
        is rebuilt from the consent record at the moment you send.
      </p>

      {flash && <Banner kind={flash.kind}>{flash.text}</Banner>}

      <div className="card">
        <div className="card-head">
          <h3>Sent and drafted</h3>
          <div className="spacer" />
          <button type="button" className="btn deep sm" onClick={() => setComposing(true)}>
            New campaign
          </button>
        </div>

        {campaigns.length === 0 ? (
          <div className="empty">
            <h3>No campaigns yet</h3>
            <p>Write one to share news, or to tell a segment about a mission that fits them.</p>
          </div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Audience</th>
                  <th>Status</th>
                  <th className="num">Sent</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="sub">{c.subject}</div>
                    </td>
                    <td>
                      <span className="pill accent">
                        {c.purpose === "news" ? "Company news" : "Mission alerts"}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${c.status === "sent" ? "good" : "neutral"}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="num tnum">
                      {c.sent_count}
                      {c.failed_count > 0 && <div className="sub">{c.failed_count} failed</div>}
                    </td>
                    <td className="sub">
                      {c.sent_at ? formatDate(c.sent_at) : formatDate(c.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {composing && (
        <Compose
          onClose={() => setComposing(false)}
          onSent={async (text) => {
            setComposing(false);
            setFlash({ kind: "ok", text });
            await load();
          }}
        />
      )}
    </>
  );
}

function Compose({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (message: string) => Promise<void>;
}) {
  const [tax, setTax] = useState<Taxonomy | null>(null);
  const [f, setF] = useState({
    name: "",
    subject: "",
    body: "Hi {first_name},\n\n",
    purpose: "news" as "news" | "mission_alerts",
    skill: "",
    industry: "",
    availability: "",
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Taxonomy>("/api/public/taxonomy")
      .then(setTax)
      .catch(() => undefined);
  }, []);

  const segment = useCallback(
    () => ({
      skills: f.skill ? [f.skill] : undefined,
      industries: f.industry ? [f.industry] : undefined,
      availability: f.availability ? [f.availability as "now"] : undefined,
    }),
    [f.skill, f.industry, f.availability],
  );

  // Recount whenever the audience definition changes, so the number on the
  // button is never stale by the time someone presses it.
  useEffect(() => {
    let cancelled = false;
    api
      .post<Preview>("/api/campaigns/preview", { segment: segment(), purpose: f.purpose })
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [segment, f.purpose]);

  return (
    <Modal title="New campaign" onClose={onClose}>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="field">
        <label htmlFor="c-name">
          Internal name <span className="hint">— only you see this</span>
        </label>
        <input id="c-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="c-purpose">This email is</label>
        <select
          id="c-purpose"
          value={f.purpose}
          onChange={(e) => setF({ ...f, purpose: e.target.value as "news" | "mission_alerts" })}
        >
          <option value="news">Company news — to people who accepted news</option>
          <option value="mission_alerts">A mission alert — to people who accepted alerts</option>
        </select>
      </div>

      <div className="grid3">
        <div className="field">
          <label htmlFor="c-skill">Skill</label>
          <select
            id="c-skill"
            value={f.skill}
            onChange={(e) => setF({ ...f, skill: e.target.value })}
          >
            <option value="">Any</option>
            {tax?.skills.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-ind">Industry</label>
          <select
            id="c-ind"
            value={f.industry}
            onChange={(e) => setF({ ...f, industry: e.target.value })}
          >
            <option value="">Any</option>
            {tax?.industries.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-av">Availability</label>
          <select
            id="c-av"
            value={f.availability}
            onChange={(e) => setF({ ...f, availability: e.target.value })}
          >
            <option value="">Any</option>
            <option value="now">Available now</option>
            <option value="from_date">From a date</option>
          </select>
        </div>
      </div>

      {preview && (
        <Banner kind={preview.eligible ? "info" : "warn"}>
          This reaches <strong>{preview.eligible}</strong> freelancer
          {preview.eligible === 1 ? "" : "s"}.{" "}
          {preview.excludedForConsent > 0 && (
            <>
              {preview.matchingSegment} match the filters, but {preview.excludedForConsent} have not
              agreed to receive {f.purpose === "news" ? "news" : "mission alerts"} and are excluded.
            </>
          )}
          {preview.eligible === 0 && " Nothing will be sent."}
        </Banner>
      )}

      <div className="field">
        <label htmlFor="c-subj">Subject</label>
        <input
          id="c-subj"
          value={f.subject}
          onChange={(e) => setF({ ...f, subject: e.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="c-body">
          Message <span className="hint">— {"{first_name}"} is replaced with their name</span>
        </label>
        <textarea
          id="c-body"
          value={f.body}
          onChange={(e) => setF({ ...f, body: e.target.value })}
        />
      </div>

      <small>
        Every message carries an unsubscribe link and a link to their profile. Nexian branding and
        the footer are added automatically.
      </small>

      <div className="btn-row" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn deep"
          disabled={
            busy || !f.name.trim() || !f.subject.trim() || !f.body.trim() || preview?.eligible === 0
          }
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const created = await api.post<{ id: string }>("/api/campaigns", {
                name: f.name,
                subject: f.subject,
                body: f.body,
                purpose: f.purpose,
                segment: segment(),
              });
              // Large audiences are sent in batches, so a single press may not
              // finish the job — say so plainly rather than implying it is done.
              const res = await api.post<{ sent: number; failed: number; remaining: number }>(
                `/api/campaigns/${created.id}/send`,
              );
              await onSent(
                `Sent to ${res.sent} freelancer${res.sent === 1 ? "" : "s"}${
                  res.failed ? `, ${res.failed} failed` : ""
                }.${
                  res.remaining > 0
                    ? ` ${res.remaining} still to go — open the campaign and press Send again to continue.`
                    : ""
                }`,
              );
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Could not send");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Sending…" : `Send to ${preview?.eligible ?? 0}`}
        </button>
        <button type="button" className="btn plain" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
