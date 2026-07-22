import { type FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
import { Banner } from "../components";

interface AuthState {
  needsBootstrap: boolean;
  mfaActive: boolean;
}

interface LoginResult {
  ok: boolean;
  mfaRequired?: boolean;
  challengeId?: string;
}

/**
 * Staff sign-in. Three shapes in one screen: first-run setup while no admin
 * exists, the password step, and the emailed-code step.
 */
export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [state, setState] = useState<AuthState | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<AuthState>("/api/auth/state")
      .then(setState)
      .catch(() => setState({ needsBootstrap: false, mfaActive: false }));
  }, []);

  // Move the cursor to the code box the moment that step appears, so the code
  // can be pasted straight from the inbox without hunting for the field.
  useEffect(() => {
    if (challengeId) codeInput.current?.focus();
  }, [challengeId]);

  const needsBootstrap = state?.needsBootstrap ?? false;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (challengeId) {
        await api.post("/api/auth/verify-code", { challengeId, code });
        onSignedIn();
        return;
      }
      if (needsBootstrap) {
        await api.post("/api/auth/bootstrap", { email, name, password, key: setupKey });
        onSignedIn();
        return;
      }
      const res = await api.post<LoginResult>("/api/auth/login", { email, password });
      if (res.mfaRequired && res.challengeId) {
        setChallengeId(res.challengeId);
        setPassword("");
        return;
      }
      onSignedIn();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong";
      setError(message);
      // A dead challenge cannot be retried, so send them back to the password
      // step rather than leaving them typing codes at something already refused.
      if (/expired|already been used|Too many incorrect/.test(message)) {
        setChallengeId(null);
        setCode("");
      }
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setChallengeId(null);
    setCode("");
    setError(null);
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src="/logo.png" alt="Nexian" />

        {challengeId ? (
          <>
            <h1>Check your email</h1>
            <p>
              We sent a six-digit code to <strong>{email}</strong>. It expires in ten minutes.
            </p>

            {error && <Banner kind="error">{error}</Banner>}

            <div className="field">
              <label htmlFor="code">Sign-in code</label>
              <input
                id="code"
                ref={codeInput}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
              />
            </div>

            <button className="btn deep" type="submit" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Checking…" : "Sign in"}
            </button>

            <p style={{ marginTop: 18, fontSize: 13 }}>
              <button type="button" className="linklike" onClick={startOver}>
                Use a different account
              </button>
            </p>
          </>
        ) : (
          <>
            <h1>{needsBootstrap ? "Create the first admin" : "Talent pool"}</h1>
            <p>
              {needsBootstrap
                ? "This installation has no accounts yet. Create the first administrator to begin."
                : "Sign in to manage contacts, the pool and campaigns."}
            </p>

            {error && <Banner kind="error">{error}</Banner>}

            {/* A protection that is switched off belongs on the screen, not in a
                settings page nobody opens. */}
            {state && !state.mfaActive && !needsBootstrap && (
              <Banner kind="warn">
                Two-factor sign-in is inactive because outbound email is not configured. Accounts
                are protected by their password alone until RESEND_API_KEY is set.
              </Banner>
            )}

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
          </>
        )}
      </form>
    </div>
  );
}
