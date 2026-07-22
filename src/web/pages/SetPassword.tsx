import { type FormEvent, useState } from "react";
import { ApiError, api } from "../api";
import { Banner } from "../components";

/** Where a staff invitation link lands: choose a password, then straight in. */
export function SetPassword() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== again) {
      setError("The two passwords are not the same.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/set-password", { token, password });
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src="/logo.png" alt="Nexian" />
        <h1>Choose your password</h1>
        {!token && (
          <Banner kind="error">This link is missing its token. Ask an admin to resend it.</Banner>
        )}
        {error && <Banner kind="error">{error}</Banner>}

        <div className="field">
          <label htmlFor="pw">
            Password <span className="hint">— at least 10 characters</span>
          </label>
          <input
            id="pw"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="pw2">Repeat it</label>
          <input
            id="pw2"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            required
          />
        </div>

        <button
          className="btn deep"
          type="submit"
          disabled={busy || !token}
          style={{ width: "100%" }}
        >
          {busy ? "Saving…" : "Save and sign in"}
        </button>
      </form>
    </div>
  );
}
