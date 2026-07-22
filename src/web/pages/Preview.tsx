import { useEffect, useState } from "react";
import { api } from "../api";
import { Banner } from "../components";
import { Portal } from "./Portal";

/**
 * What the freelancer sees, shown from the staff side: each email as it lands
 * in their inbox, the public registration page, and the portal of a registered
 * freelancer. All of it renders from sample data — previewing never opens a
 * real freelancer's record and never mints a live link.
 */

const EMAILS = [
  { key: "invite", label: "Invitation", note: "First contact — sent by the wave or by hand" },
  { key: "followup", label: "Follow-up", note: "Once, 10 days later, then never again" },
  { key: "welcome", label: "Welcome", note: "The moment someone registers" },
  { key: "reminder", label: "Availability reminder", note: "Quarterly, one-click confirm" },
] as const;

type EmailKey = (typeof EMAILS)[number]["key"];

export function Preview() {
  const [tab, setTab] = useState<"emails" | "join" | "portal">("emails");
  const [emailKey, setEmailKey] = useState<EmailKey>("invite");
  const [rendered, setRendered] = useState<{ subject: string; html: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (tab !== "emails") return;
    setRendered(null);
    setFailed(false);
    api
      .get<{ subject: string; html: string }>(`/api/admin/preview/email?template=${emailKey}`)
      .then(setRendered)
      .catch(() => setFailed(true));
  }, [tab, emailKey]);

  return (
    <>
      <h1>Preview</h1>
      <p>
        How the app looks from the freelancer's side — the emails they receive, the page your
        invitation links to, and the profile they manage after registering. Everything here is
        sample data; no real freelancer's record is opened.
      </p>

      <div className="btn-row" style={{ marginBottom: 16 }}>
        {(
          [
            ["emails", "Emails they receive"],
            ["join", "Registration page"],
            ["portal", "Their profile portal"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "btn sm" : "btn plain sm"}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "emails" && (
        <div className="card">
          <div className="filters">
            {EMAILS.map((e) => (
              <button
                key={e.key}
                type="button"
                className={emailKey === e.key ? "btn sm" : "btn plain sm"}
                onClick={() => setEmailKey(e.key)}
              >
                {e.label}
              </button>
            ))}
          </div>
          <p className="sub">{EMAILS.find((e) => e.key === emailKey)?.note}</p>
          {failed ? (
            <Banner kind="error">
              Could not render the preview — are you signed in as an admin?
            </Banner>
          ) : !rendered ? (
            <div className="spinner">Rendering…</div>
          ) : (
            <>
              <p style={{ fontSize: 13.5 }}>
                Subject: <strong>{rendered.subject}</strong>
              </p>
              {/* Sandboxed: preview HTML must not run scripts or navigate the app. */}
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={rendered.html}
                style={{
                  width: "100%",
                  height: 560,
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  background: "#f4f2f6",
                }}
              />
            </>
          )}
        </div>
      )}

      {tab === "join" && (
        <div className="card">
          <p style={{ fontSize: 13.5 }}>
            The registration page is public — this is exactly what your invitation links to.
          </p>
          <a className="btn deep" href="/join" target="_blank" rel="noreferrer">
            Open the registration page in a new tab
          </a>
        </div>
      )}

      {tab === "portal" && (
        <div className="preview-frame">
          <Portal preview />
        </div>
      )}
    </>
  );
}
