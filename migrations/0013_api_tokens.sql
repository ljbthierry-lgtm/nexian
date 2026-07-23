-- Personal API tokens for the browser extension.
--
-- The LinkedIn helper extension runs on linkedin.com and needs to call this app
-- to fetch the prepared message for whoever's profile a recruiter is looking at.
-- A session cookie can't carry that call — it is cross-site and SameSite=Lax, so
-- the cookie is never sent — and copying the session token into an extension
-- would be worse. So each staff member mints a long-lived bearer token, scoped
-- to their own account, revocable, and stored only as a hash.
CREATE TABLE api_tokens (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at   TEXT
);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);
