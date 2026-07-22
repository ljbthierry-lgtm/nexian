-- Contacts that exist only as a LinkedIn profile.
--
-- Half of a real prospect list has no email address. Until now the schema made
-- email the identity of a contact (NOT NULL UNIQUE), which silently made the
-- other half of the list unrepresentable. Email becomes optional; identity is
-- "at least one reachable channel", enforced in code at the import boundary.
--
-- `linkedin_key` is the normalised form of the profile URL (see
-- src/worker/lib/linkedinKey.ts) and does for LinkedIn what lowercasing does
-- for email: one person, one key, however the URL was pasted. The raw URL the
-- user typed stays in `linkedin_url` for display and linking.
--
-- Rebuilt rather than ALTERed because dropping NOT NULL needs a rebuild in
-- SQLite anyway, and the table is empty in production — the same reasoning as
-- migration 0006. Child tables reference contacts(id) by name, so the
-- drop-and-rename leaves their foreign keys pointing at the new table.

PRAGMA defer_foreign_keys = on;

CREATE TABLE contacts_new (
  id                TEXT PRIMARY KEY,
  email             TEXT,
  first_name        TEXT NOT NULL DEFAULT '',
  last_name         TEXT NOT NULL DEFAULT '',
  phone             TEXT,
  linkedin_url      TEXT,
  linkedin_key      TEXT,
  source            TEXT NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'import', 'linkedin', 'referral', 'self_signup', 'event')),
  source_note       TEXT,
  stage             TEXT NOT NULL DEFAULT 'prospect'
                    CHECK (stage IN ('prospect', 'contacted', 'registered', 'vetted', 'on_mission', 'closed')),
  owner_user_id     TEXT REFERENCES users(id),
  internal_notes    TEXT,
  suppressed        INTEGER NOT NULL DEFAULT 0,
  suppressed_at     TEXT,
  suppressed_reason TEXT,
  outreach_count    INTEGER NOT NULL DEFAULT 0,
  first_outreach_at TEXT,
  last_outreach_at  TEXT,
  linkedin_state    TEXT NOT NULL DEFAULT 'none'
                    CHECK (linkedin_state IN ('none', 'queued', 'sent')),
  linkedin_sent_at  TEXT,
  anonymized_at     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO contacts_new (id, email, first_name, last_name, phone, linkedin_url, source,
  source_note, stage, owner_user_id, internal_notes, suppressed, suppressed_at,
  suppressed_reason, outreach_count, first_outreach_at, last_outreach_at, linkedin_state,
  linkedin_sent_at, anonymized_at, created_at, updated_at)
SELECT id, email, first_name, last_name, phone, linkedin_url, source,
  source_note, stage, owner_user_id, internal_notes, suppressed, suppressed_at,
  suppressed_reason, outreach_count, first_outreach_at, last_outreach_at, linkedin_state,
  linkedin_sent_at, anonymized_at, created_at, updated_at
FROM contacts;

DROP TABLE contacts;
ALTER TABLE contacts_new RENAME TO contacts;

-- Partial unique indexes: several NULLs may coexist, real values may not.
CREATE UNIQUE INDEX idx_contacts_email ON contacts(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_contacts_linkedin_key ON contacts(linkedin_key) WHERE linkedin_key IS NOT NULL;
CREATE INDEX idx_contacts_stage ON contacts(stage);
CREATE INDEX idx_contacts_suppressed ON contacts(suppressed);
CREATE INDEX idx_contacts_outreach ON contacts(outreach_count, last_outreach_at);
