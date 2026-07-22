import { useEffect, useState } from "react";
import { type Taxonomy, api } from "../api";

/**
 * The privacy notice every outreach email and the registration form link to.
 *
 * It is deliberately plain and specific — a page that only says "we value your
 * privacy" is worse than nothing when someone is deciding whether to hand over
 * their CV and day rate.
 */
export function Privacy() {
  const [meta, setMeta] = useState<Taxonomy | null>(null);
  useEffect(() => {
    api
      .get<Taxonomy>("/api/public/taxonomy")
      .then(setMeta)
      .catch(() => undefined);
  }, []);

  return (
    <div className="public">
      <div className="public-inner">
        <img className="public-logo" src="/logo.png" alt="Nexian" />
        <h1>Privacy notice — freelance pool</h1>
        <p>
          This notice explains what we do with the details you give us, or that we collect about you
          as a professional, for our freelance talent pool. Policy version{" "}
          {meta?.policyVersion ?? "—"}.
        </p>

        <div className="card">
          <h3>Who is responsible</h3>
          <p>
            Nexian (part of Solvint Group) is the controller of this data. For any question about
            it, or to exercise the rights below, contact us at the address in our email signature.
          </p>

          <h3>What we hold, and why</h3>
          <p>
            If you registered: your name, contact details, professional experience, skills,
            industries, languages, day rate, availability, location and the CV you uploaded. We use
            it for one thing — matching you with client missions. The legal basis is your consent,
            which you gave on the registration form.
          </p>
          <p>
            If we contacted you before you registered: your name, professional email address and, if
            we found it, your LinkedIn profile. We use it to ask, at most twice, whether joining the
            pool interests you. The legal basis is our legitimate interest in professional
            recruitment. Every such message tells you where we got your details and includes a
            one-click way to stop.
          </p>

          <h3>Who sees it</h3>
          <p>
            Our own consultants. We do not sell or rent your data. It is stored on Cloudflare
            infrastructure, and outbound email is sent through Resend; both act as processors on our
            instructions. We share a profile with a client only when a specific mission is discussed
            and you have agreed to it.
          </p>

          <h3>How long we keep it</h3>
          <p>
            Registered profiles: for as long as you want to stay in the pool. We ask you
            periodically to confirm your details are still current. Prospects who never registered:
            their details are removed automatically after the retention period, and sooner on
            request.
          </p>

          <h3>Your rights</h3>
          <p>
            You can see, correct, download or delete everything we hold, at any time, from your own
            profile page — no request or waiting period. You can also withdraw consent for mission
            alerts or news separately, without leaving the pool. You have the right to lodge a
            complaint with the Belgian Data Protection Authority.
          </p>

          <div className="btn-row" style={{ marginTop: 18 }}>
            <a className="btn" href="/join">
              Go to the registration page
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
