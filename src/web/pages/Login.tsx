import { type FormEvent, useEffect, useState } from "react";
import { ApiError, api } from "../api";
import { Banner } from "../components";

/** Staff sign-in. Doubles as first-run setup while no admin account exists. */
export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ needsBootstrap: boolean }>("/api/auth/state")
      .then((s) => setNeedsBootstrap(s.needsBootstrap))
      .catch(() => setNeedsBootstrap(false));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (needsBootstrap) {
        await api.post("/api/auth/bootstrap", { email, name, password, key: setupKey });
      } else {
        await api.post("/api/auth/login", { email, password });
      }
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src="/logo.png" alt="Nexian" />
        <h1>{needsBootstrap ? "Create the first admin" : "Talent pool"}</h1>
        <p>
          {needsBootstrap
            ? "This installation has no accounts yet. Create the first administrator to begin."
            : "Sign in to manage contacts, the pool and campaigns."}
        </p>

        {error && <Banner kind="error">{error}</Banner>}

        {needsBootstrap && (
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">
            Password {needsBootstrap && <span className="hint">— at least 10 characters</span>}
          </label>
          <input
            id="password"
            type="password"
            autoComplete={needsBootstrap ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={needsBootstrap ? 10 : undefined}
          />
        </div>

        {needsBootstrap && (
          <div className="field">
            <label htmlFor="key">
              Setup key <span className="hint">— the SETUP_KEY secret</span>
            </label>
            <input
              id="key"
              value={setupKey}
              onChange={(e) => setSetupKey(e.target.value)}
              required
            />
          </div>
        )}

        <button className="btn deep" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Please wait…" : needsBootstrap ? "Create admin & sign in" : "Sign in"}
        </button>

        <p style={{ marginTop: 18, fontSize: 13 }}>
          Freelancer? <a href="/join">Go to the registration page</a>.
        </p>
      </form>
    </div>
  );
}
