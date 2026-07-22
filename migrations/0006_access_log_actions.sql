-- Widen the set of actions the access log can record.
--
-- The original CHECK listed only the three download/export actions. SQLite
-- cannot alter a CHECK constraint in place, so the table is rebuilt — and doing
-- it now, while the log is empty, costs nothing. Leaving it would mean a far
-- more awkward rebuild later, on a table that by then holds evidence.
--
-- The new values are listed up front so that turning on read-logging, or
-- recording an export of the log itself, becomes a code change rather than
-- another migration against a populated audit trail.

DROP TRIGGER access_log_no_delete;
DROP TRIGGER access_log_no_update;

-- `user_id` deliberately carries NO foreign key, and that is the point of this
-- migration as much as the wider action list.
--
-- An append-only table cannot hold a reference to a mutable one. The original
-- plain reference defaulted to RESTRICT, so a staff member who had ever
-- downloaded anything could not be removed at all — the audit trail would have
-- become a reason you cannot offboard someone. The obvious repair, ON DELETE SET
-- NULL, is worse in a subtler way: it works by UPDATEing the log row, which the
-- append-only trigger below refuses, so deleting a user would fail with a
-- message about tampering. Both were caught by test/accessLog.test.ts.
--
-- The resolution is that an audit log is a historical record, not relational
-- data. `user_name` is a snapshot taken at the moment of the download and is the
-- durable answer to "who"; `user_id` is kept only as a convenient filter key.
-- `contact_id` is unreferenced for the same reason: erasing a freelancer must
-- not erase the evidence of who had already taken their CV.
CREATE TABLE access_log_new (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  user_name   TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL CHECK (action IN (
                'cv_download',
                'pool_export',
                'contacts_export',
                'access_log_export',
                'contact_view',
                'pool_view'
              )),
  contact_id  TEXT,
  detail      TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO access_log_new (id, user_id, user_name, action, contact_id, detail, ip, created_at)
SELECT id, user_id, user_name, action, contact_id, detail, ip, created_at FROM access_log;

DROP TABLE access_log;
ALTER TABLE access_log_new RENAME TO access_log;

CREATE INDEX idx_access_log_time ON access_log(created_at);
CREATE INDEX idx_access_log_contact ON access_log(contact_id, created_at);
CREATE INDEX idx_access_log_user ON access_log(user_id, created_at);
-- Filtering the audit screen by what happened, which is the first thing anyone
-- investigating an incident reaches for.
CREATE INDEX idx_access_log_action ON access_log(action, created_at);

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
