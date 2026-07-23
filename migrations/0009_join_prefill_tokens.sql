-- A token purpose for personalised invitation links.
--
-- The invitation email and the LinkedIn message now carry a per-person link to
-- the registration page with the fields we already hold filled in. The token in
-- that link is what makes the pre-fill defensible: only the holder of a link we
-- addressed to that person sees that person's details, the token is random and
-- stored hashed like every other action token, and registering burns it.
--
-- SQLite cannot widen a CHECK in place, so the table is rebuilt with the rows
-- carried over — same pattern as migrations 0006 and 0007.

CREATE TABLE action_tokens_new (
  token_hash  TEXT PRIMARY KEY,
  purpose     TEXT NOT NULL CHECK (purpose IN (
                'portal_link',
                'confirm_availability',
                'unsubscribe',
                'set_password',
                'join_prefill'
              )),
  contact_id  TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  payload     TEXT NOT NULL DEFAULT '{}',
  single_use  INTEGER NOT NULL DEFAULT 1,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO action_tokens_new (token_hash, purpose, contact_id, user_id, payload, single_use,
  expires_at, used_at, created_at)
SELECT token_hash, purpose, contact_id, user_id, payload, single_use,
  expires_at, used_at, created_at
FROM action_tokens;

DROP TABLE action_tokens;
ALTER TABLE action_tokens_new RENAME TO action_tokens;

CREATE INDEX idx_tokens_contact ON action_tokens(contact_id);
