-- Two-factor sign-in for staff, and a record of who read what.
--
-- Between them these close the gap named in the security review: until now a
-- single stolen staff password was enough to reach every CV and day rate in the
-- pool, and nothing recorded that it had happened.

-- ------------------------------------------------------------ sign-in codes
-- A password alone no longer produces a session. It produces a challenge, and
-- the six-digit code emailed to the staff member's own inbox completes it.
--
-- Six digits is a small space, so the defences are the expiry, the attempt cap
-- and the fact that a challenge dies the moment either is exceeded. The code is
-- stored hashed with the challenge id as salt, so a leaked backup cannot be
-- turned back into a working code.
CREATE TABLE login_challenges (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_login_challenges_user ON login_challenges(user_id, created_at);
CREATE INDEX idx_login_challenges_expiry ON login_challenges(expires_at);

-- --------------------------------------------------------------- access log
-- The activity trail records changes. This records READS of personal data: who
-- downloaded whose CV, and who took a bulk export of the pool.
--
-- Deliberately separate from `activity`: activity belongs to one contact and is
-- partly visible to that contact, whereas a bulk export belongs to no single
-- person and names a member of staff. Keeping them apart means neither can leak
-- into the other by accident.
CREATE TABLE access_log (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  user_name   TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL CHECK (action IN ('cv_download', 'pool_export', 'contacts_export')),
  contact_id  TEXT,
  detail      TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_access_log_time ON access_log(created_at);
CREATE INDEX idx_access_log_contact ON access_log(contact_id, created_at);
CREATE INDEX idx_access_log_user ON access_log(user_id, created_at);

-- The staff member's name is copied in rather than only referenced, so removing
-- a leaver's user row cannot blank out the history of what they downloaded.
-- Same reasoning as the append-only consent ledger: evidence outlives the actor.
CREATE TRIGGER access_log_no_delete
BEFORE DELETE ON access_log
BEGIN
  SELECT RAISE(ABORT, 'access_log is append-only: it records who read personal data');
END;

CREATE TRIGGER access_log_no_update
BEFORE UPDATE ON access_log
BEGIN
  SELECT RAISE(ABORT, 'access_log is append-only: it records who read personal data');
END;
