import { useCallback, useEffect, useState } from "react";
import { ApiError, type Contact, api } from "../api";
import { Banner, Modal, Stat, formatDate } from "../components";
import { ImportModal, LinkedInModal } from "./Contacts";

/**
 * The invitation workflow, end to end: import a list, run the email wave, work
 * the LinkedIn queue, and watch prospects move through the funnel.
 *
 * The Contacts page stays the master record of everyone; this screen is the
 * campaign desk for the one job of getting the not-yet-invited to register.
 */

interface WaveStatus {
  active: boolean;
  dailyLimit: number;
  startedAt: string | null;
  completedAt: string | null;
  remaining: number;
  sentSinceStart: number;
  nextRunUtc: string;
}

interface QueueEntry {
  id: string;
  name: string;
  linkedin_url: string | null;
  hasEmail: boolean;
  queued: boolean;
  outreach_count: number;
}

interface FunnelStats {
  prospects: number;
  contacted: number;
  registered: number;
  suppressed: number;
  linkedinQueue: number;
}

const STATUS_FILTERS = [
  { value: "", label: "Everyone" },
  { value: "not_invited", label: "Not invited yet" },
  { value: "invited_1", label: "Invited — awaiting reply" },
  { value: "invited_2", label: "Invited 2× — awaiting reply" },
  { value: "queued_linkedin", label: "In the LinkedIn queue" },
  { value: "replied", label: "Replied" },
  { value: "undeliverable", label: "Email undeliverable" },
  { value: "registered", label: "Registered" },
  { value: "declined", label: "Declined / do not contact" },
];

export function Invitations() {
  const [wave, setWave] = useState<WaveStatus | null>(null);
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [flash, setFlash] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [linkedInId, setLinkedInId] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState(40);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [w, s, list, q] = await Promise.all([
      api.get<WaveStatus>("/api/outreach/wave"),
      api.get<FunnelStats>("/api/contacts/stats"),
      api.get<{ contacts: Contact[] }>("/api/contacts?limit=500"),
      api.get<{ queue: QueueEntry[] }>("/api/outreach/queue"),
    ]);
    setWave(w);
    setDailyLimit(w.dailyLimit);
    setStats(s);
    setContacts(list.contacts);
    setQueue(q.queue);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setWaveState(action: "start" | "pause") {
    setBusy(true);
    try {
      await api.post("/api/outreach/wave", { action, dailyLimit });
      setFlash(
        action === "start"
          ? {
              kind: "ok",
              text: `Wave running — up to ${dailyLimit} invitations go out with the nightly job (07:00 UTC).`,
            }
          : { kind: "ok", text: "Wave paused. Nobody else will be emailed until you restart it." },
      );
      await load();
    } catch (err) {
      setFlash({ kind: "error", text: err instanceof ApiError ? err.message : "Could not update" });
    } finally {
      setBusy(false);
    }
  }

  async function recordReply(id: string, outcome: "interested" | "not_now" | "not_interested") {
    await api.post(`/api/contacts/${id}/reply`, { outcome });
    setFlash({
      kind: "ok",
      text:
        outcome === "not_interested"
          ? "Recorded — they will not be contacted again."
          : "Recorded — the invitation sequence stops here for them.",
    });
    await load();
  }

  async function markDeclined(id: string, name: string) {
    if (
      !window.confirm(
        `Mark ${name || "this person"} as declined? They will never be contacted again.`,
      )
    )
      return;
    await api.post(`/api/contacts/${id}/suppress`, { reason: "Declined the invitation" });
    setFlash({ kind: "ok", text: "Marked as declined — they will not be contacted again." });
    await load();
  }

  const filtered = statusFilter
    ? contacts.filter((ct) => ct.invite_status.key === statusFilter)
    : contacts;

  return (
    <>
      <h1>Invitations</h1>
      <p>
        Getting your list from <strong>not invited yet</strong> to <strong>registered</strong> —
        email goes out automatically in daily waves; LinkedIn messages are prepared here and sent by
        you.
      </p>

      {flash && <Banner kind={flash.kind}>{flash.text}</Banner>}

      <div className="stats">
        <Stat value={stats?.prospects ?? "—"} label="Not invited yet" />
        <Stat value={stats?.contacted ?? "—"} label="Invited, awaiting reply" tone="warn" />
        <Stat value={stats?.registered ?? "—"} label="Registered" tone="good" />
        <Stat value={stats?.suppressed ?? "—"} label="Declined / do not contact" tone="bad" />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Email invitation wave</h3>
            {wave === null ? (
              <p className="sub">Loading…</p>
            ) : wave.active ? (
              <p className="sub">
                <span className="pill good">Running</span> {wave.sentSinceStart} sent since{" "}
                {formatDate(wave.startedAt)} · {wave.remaining} still to invite · next batch of{" "}
                {Math.min(wave.dailyLimit, 40)} at {wave.nextRunUtc} UTC
              </p>
            ) : wave.completedAt ? (
              <p className="sub">
                <span className="pill good">Finished</span> everyone with an email address has been
                invited ({wave.sentSinceStart} sent). New imports start a new wave.
              </p>
            ) : (
              <p className="sub">
                <span className="pill neutral">Not running</span>{" "}
                {wave.remaining
                  ? `${wave.remaining} people with an email address are waiting for their first invitation.`
                  : "Nobody is waiting — import a list to fill the wave."}
              </p>
            )}
          </div>
          <div className="btn-row" style={{ alignItems: "center" }}>
            <label htmlFor="wave-limit" className="sub" style={{ whiteSpace: "nowrap" }}>
              Per day
            </label>
            <input
              id="wave-limit"
              type="number"
              min={1}
              max={100}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Number.parseInt(e.target.value, 10) || 40)}
              style={{ width: 72 }}
              disabled={wave?.active}
            />
            {wave?.active ? (
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => setWaveState("pause")}
              >
                Pause wave
              </button>
            ) : (
              <button
                type="button"
                className="btn deep"
                disabled={busy || !wave || wave.remaining === 0}
                onClick={() => setWaveState("start")}
              >
                Start wave
              </button>
            )}
          </div>
        </div>
        <p className="sub" style={{ marginTop: 6 }}>
          Each person gets at most one invitation and one follow-up 10 days later, and drops out the
          moment they register or opt out. Batches above 40/day are capped at 40 — pacing keeps your
          emails out of spam folders.
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>LinkedIn queue</h3>
            <p className="sub">
              {queue.length
                ? `${queue.length} people to message by hand — the app writes the message, you paste and send it. Faster with the browser extension (Settings → Browser extension): one click on their LinkedIn profile copies the right message.`
                : "Nobody waiting. Prospects with a LinkedIn profile and touch budget appear here."}
            </p>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => setShowImport(true)}>
            Import a list
          </button>
        </div>
        {queue.length > 0 && (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Who</th>
                  <th>Channels</th>
                  <th>Touches used</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {queue.slice(0, 25).map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <strong>{entry.name || "(no name)"}</strong>
                      {entry.queued && (
                        <span className="pill neutral" style={{ marginLeft: 8 }}>
                          queued
                        </span>
                      )}
                    </td>
                    <td className="sub">{entry.hasEmail ? "LinkedIn + email" : "LinkedIn only"}</td>
                    <td className="sub">{entry.outreach_count} / 2</td>
                    <td>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setLinkedInId(entry.id)}
                      >
                        Prepare message
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="filters">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by invitation status"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <div className="spacer" />
          <span className="sub">
            {filtered.length} of {contacts.length}
          </span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Reachable by</th>
                <th>Status</th>
                <th>Last touch</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ct) => (
                <tr key={ct.id}>
                  <td>
                    <strong>
                      {`${ct.first_name} ${ct.last_name}`.trim() || ct.email || "(no name)"}
                    </strong>
                    <div className="sub">{ct.email ?? "LinkedIn only"}</div>
                  </td>
                  <td className="sub">
                    {[ct.email && "email", ct.linkedin_url && "LinkedIn"]
                      .filter(Boolean)
                      .join(" + ") || "—"}
                  </td>
                  <td>
                    <span className={`pill ${ct.invite_status.tone}`}>
                      {ct.invite_status.label}
                    </span>
                    {ct.email_status === "bounced" && (
                      <div className="sub">Address undeliverable — no more email</div>
                    )}
                    {ct.reply_outcome && (
                      <div className="sub">{ct.reply_outcome.replace(/_/g, " ")}</div>
                    )}
                  </td>
                  <td className="sub">
                    {ct.last_outreach_at ? formatDate(ct.last_outreach_at) : "—"}
                  </td>
                  <td>
                    {!ct.has_profile && !ct.suppressed && (
                      <div className="btn-row">
                        {/* Recording a reply is the common case after a wave:
                            it stops the follow-up, which is the courteous and
                            the legally safer thing to do. */}
                        {!ct.replied_at && ct.outreach_count > 0 && (
                          <select
                            defaultValue=""
                            aria-label={`Record a reply from ${ct.first_name} ${ct.last_name}`}
                            onChange={(e) => {
                              const v = e.target.value;
                              e.target.value = "";
                              if (v) void recordReply(ct.id, v as "interested");
                            }}
                            style={{ width: "auto" }}
                          >
                            <option value="">Record reply…</option>
                            <option value="interested">Interested</option>
                            <option value="not_now">Not right now</option>
                            <option value="not_interested">Not interested</option>
                          </select>
                        )}
                        <button
                          type="button"
                          className="btn plain sm"
                          onClick={() =>
                            void markDeclined(ct.id, `${ct.first_name} ${ct.last_name}`.trim())
                          }
                        >
                          Mark declined
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={async (message) => {
            setShowImport(false);
            setFlash({ kind: "ok", text: message });
            await load();
          }}
        />
      )}
      {linkedInId && (
        <LinkedInModal id={linkedInId} onClose={() => setLinkedInId(null)} onChanged={load} />
      )}
    </>
  );
}
