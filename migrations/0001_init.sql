-- Nexian Talent Pool — initial schema.
--
-- Consent model, in one paragraph: every person in `contacts` is opted OUT until
-- they themselves grant consent on the platform. Consent is never a column that
-- gets overwritten — it is an append-only ledger (`consents`), so we can always
-- prove what someone agreed to, when, and against which privacy-policy version.
-- The `consent_current` view resolves the latest row per (contact, purpose) and
-- is the ONLY thing campaign sending is allowed to read.

-- ---------------------------------------------------------------- staff users
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'recruiter')),
  pw_hash       TEXT,
  pw_salt       TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ------------------------------------------------------------------- contacts
-- Everyone we know of: cold prospects and registered freelancers alike.
CREATE TABLE contacts (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  first_name        TEXT NOT NULL DEFAULT '',
  last_name         TEXT NOT NULL DEFAULT '',
  phone             TEXT,
  linkedin_url      TEXT,
  -- Where the record came from. Shown in the first outreach email, because GDPR
  -- requires telling people how we obtained their details.
  source            TEXT NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'import', 'linkedin', 'referral', 'self_signup', 'event')),
  source_note       TEXT,
  stage             TEXT NOT NULL DEFAULT 'prospect'
                    CHECK (stage IN ('prospect', 'contacted', 'registered', 'vetted', 'on_mission', 'closed')),
  owner_user_id     TEXT REFERENCES users(id),
  internal_notes    TEXT,
  -- Hard suppression: never contact again, for any reason, by any channel.
  suppressed        INTEGER NOT NULL DEFAULT 0,
  suppressed_at     TEXT,
  suppressed_reason TEXT,
  -- Cold-outreach counters enforce the legitimate-interest touch limit.
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
CREATE INDEX idx_contacts_stage ON contacts(stage);
CREATE INDEX idx_contacts_suppressed ON contacts(suppressed);
CREATE INDEX idx_contacts_outreach ON contacts(outreach_count, last_outreach_at);

-- -------------------------------------------------------------------- profiles
-- The freelancer-owned part of the record: only they (or an admin acting for
-- them) ever change it. One row per contact, created at registration.
CREATE TABLE profiles (
  contact_id        TEXT PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  headline          TEXT NOT NULL DEFAULT '',
  years_experience  INTEGER,
  -- JSON arrays of labels, kept denormalised: the pool is filtered, not joined.
  skills            TEXT NOT NULL DEFAULT '[]',
  industries        TEXT NOT NULL DEFAULT '[]',
  languages         TEXT NOT NULL DEFAULT '[]',
  daily_rate        INTEGER,
  currency          TEXT NOT NULL DEFAULT 'EUR',
  availability      TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (availability IN ('now', 'from_date', 'not_available', 'unknown')),
  available_from    TEXT,
  location          TEXT,
  remote_ok         INTEGER NOT NULL DEFAULT 0,
  freelancer_note   TEXT,
  cv_filename       TEXT,
  cv_mime           TEXT,
  cv_size           INTEGER,
  cv_uploaded_at    TEXT,
  registered_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  -- Set every time the freelancer confirms their availability is still correct.
  last_confirmed_at TEXT,
  -- Set when a reminder goes out, so the cron does not nag twice.
  last_reminded_at  TEXT
);
CREATE INDEX idx_profiles_availability ON profiles(availability, available_from);
CREATE INDEX idx_profiles_rate ON profiles(daily_rate);

-- CV bytes live in D1 as 512 KB chunks (a single D1 value is capped at ~2 MB).
-- `src/worker/lib/cvStore.ts` is the only reader/writer — swap it for an R2
-- bucket without touching anything else when the account has R2 enabled.
CREATE TABLE cv_chunks (
  contact_id  TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  idx         INTEGER NOT NULL,
  data        BLOB NOT NULL,
  PRIMARY KEY (contact_id, idx)
);

-- -------------------------------------------------------------------- consents
-- APPEND ONLY. Never UPDATE, never DELETE a row here: this table is the proof.
CREATE TABLE consents (
  seq            INTEGER PRIMARY KEY AUTOINCREMENT,
  id             TEXT NOT NULL,
  contact_id     TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  purpose        TEXT NOT NULL CHECK (purpose IN ('data_processing', 'mission_alerts', 'news')),
  granted        INTEGER NOT NULL CHECK (granted IN (0, 1)),
  source         TEXT NOT NULL CHECK (source IN ('registration_form', 'profile_page', 'unsubscribe_link', 'admin', 'import_declared')),
  policy_version TEXT NOT NULL DEFAULT '',
  ip             TEXT,
  user_agent     TEXT,
  actor          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_consents_contact ON consents(contact_id, purpose, seq);

-- Latest consent decision per (contact, purpose). Campaign audiences read this
-- and nothing else, so an opted-out address cannot physically enter a mailing.
CREATE VIEW consent_current AS
SELECT c.contact_id, c.purpose, c.granted, c.policy_version, c.created_at
FROM consents c
JOIN (
  SELECT contact_id, purpose, MAX(seq) AS mx
  FROM consents
  GROUP BY contact_id, purpose
) latest
  ON latest.contact_id = c.contact_id
 AND latest.purpose = c.purpose
 AND latest.mx = c.seq;

-- -------------------------------------------------------------------- activity
-- Accountability trail: every touch, every consent change, every export.
CREATE TABLE activity (
  id             TEXT PRIMARY KEY,
  contact_id     TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  channel        TEXT,
  summary        TEXT NOT NULL,
  detail         TEXT,
  actor_user_id  TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_activity_contact ON activity(contact_id, created_at);

-- ------------------------------------------------------------------- campaigns
CREATE TABLE campaigns (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  -- Which consent a recipient must have granted to be eligible.
  purpose       TEXT NOT NULL CHECK (purpose IN ('mission_alerts', 'news')),
  segment       TEXT NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent')),
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at       TEXT,
  sent_count    INTEGER NOT NULL DEFAULT 0,
  failed_count  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE campaign_recipients (
  campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id   TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status       TEXT NOT NULL,
  error        TEXT,
  sent_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, contact_id)
);

-- --------------------------------------------------------------- action tokens
-- Behind every email button. The raw token exists only in the URL; we store the
-- SHA-256. Single-use by default; unsubscribe links stay usable so an old email
-- never traps someone who wants out.
CREATE TABLE action_tokens (
  token_hash  TEXT PRIMARY KEY,
  purpose     TEXT NOT NULL CHECK (purpose IN ('portal_link', 'confirm_availability', 'unsubscribe', 'set_password')),
  contact_id  TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  payload     TEXT NOT NULL DEFAULT '{}',
  single_use  INTEGER NOT NULL DEFAULT 1,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tokens_contact ON action_tokens(contact_id);

-- Freelancer portal sessions, created by following a magic link. Separate from
-- staff `sessions` so a portal cookie can never reach the back office.
CREATE TABLE contact_sessions (
  token_hash  TEXT PRIMARY KEY,
  contact_id  TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contact_sessions_contact ON contact_sessions(contact_id);

-- ------------------------------------------------------------------ email log
CREATE TABLE email_log (
  id           TEXT PRIMARY KEY,
  to_email     TEXT NOT NULL,
  template     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  contact_id   TEXT,
  campaign_id  TEXT,
  status       TEXT NOT NULL,
  provider_id  TEXT,
  error        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_email_log_contact ON email_log(contact_id, created_at);

-- ------------------------------------------------------------------- taxonomy
-- Admin-editable skill and industry lists that drive the registration form.
CREATE TABLE taxonomy (
  id      TEXT PRIMARY KEY,
  kind    TEXT NOT NULL CHECK (kind IN ('skill', 'industry', 'language')),
  label   TEXT NOT NULL,
  sort    INTEGER NOT NULL DEFAULT 100,
  active  INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX idx_taxonomy_kind_label ON taxonomy(kind, label);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Permanent do-not-contact list, keyed by SHA-256 of the lower-cased email.
-- It outlives the contact row on purpose: once a record is deleted or anonymised
-- there is no address left to compare against, and the same person could be
-- re-imported next month and contacted again. Storing the hash honours the
-- opt-out forever while keeping no readable address.
CREATE TABLE suppression_list (
  email_hash  TEXT PRIMARY KEY,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Starter taxonomy — consulting-generic, editable in Settings once live.
INSERT INTO taxonomy (id, kind, label, sort) VALUES
  ('sk-pm',    'skill', 'Project management', 10),
  ('sk-chg',   'skill', 'Change management', 20),
  ('sk-proc',  'skill', 'Procurement', 30),
  ('sk-fin',   'skill', 'Finance transformation', 40),
  ('sk-data',  'skill', 'Data analysis', 50),
  ('sk-erp',   'skill', 'ERP / SAP', 60),
  ('sk-interim','skill', 'Interim management', 70),
  ('sk-ba',    'skill', 'Business analysis', 80),
  ('sk-it',    'skill', 'IT / software delivery', 90),
  ('sk-hr',    'skill', 'HR / talent', 100),
  ('sk-legal', 'skill', 'Legal & contracting', 110),
  ('sk-supply','skill', 'Supply chain', 120),
  ('in-pharma','industry', 'Pharma & life sciences', 10),
  ('in-bank',  'industry', 'Banking & insurance', 20),
  ('in-manu',  'industry', 'Manufacturing', 30),
  ('in-pub',   'industry', 'Public sector', 40),
  ('in-energy','industry', 'Energy & utilities', 50),
  ('in-retail','industry', 'Retail & FMCG', 60),
  ('in-logi',  'industry', 'Transport & logistics', 70),
  ('in-tech',  'industry', 'Technology & telecom', 80),
  ('la-nl',    'language', 'Dutch', 10),
  ('la-fr',    'language', 'French', 20),
  ('la-en',    'language', 'English', 30),
  ('la-de',    'language', 'German', 40);
