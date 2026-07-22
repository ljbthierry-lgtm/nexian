-- What happened to an email after we handed it over, plus the alerting that
-- makes an unusual export visible.
--
-- Until now the app recorded that Resend ACCEPTED a message and inferred the
-- rest. Accepted is not delivered: an address can be dead, full, or the person
-- can press "spam". Each of those means something different, and conflating
-- them is how a sender reputation quietly dies.

-- --------------------------------------------------- per-message outcome
ALTER TABLE email_log ADD COLUMN delivered_at TEXT;
ALTER TABLE email_log ADD COLUMN bounced_at TEXT;
-- 'permanent' | 'transient' | 'complaint'
ALTER TABLE email_log ADD COLUMN bounce_kind TEXT;
ALTER TABLE email_log ADD COLUMN outcome_detail TEXT;

-- --------------------------------------------------- per-contact outcome
-- Deliverability is a TECHNICAL fact and is deliberately NOT the suppression
-- list. Suppression records a person's CHOICE, is hashed, and survives deletion
-- and re-import. A dead mailbox is not a choice: if the same person registers
-- later with a working address, nothing should stand in their way. So a hard
-- bounce sets this flag, and only a spam complaint — which is a choice, and the
-- clearest one there is — also writes to the suppression list.
--   'unknown' | 'delivered' | 'bounced' | 'complained'
ALTER TABLE contacts ADD COLUMN email_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE contacts ADD COLUMN email_failed_at TEXT;

-- A reply — however it reaches us — ends the sequence. Recorded separately from
-- the outcome so "they answered" and "what they said" stay distinguishable.
ALTER TABLE contacts ADD COLUMN replied_at TEXT;
-- 'interested' | 'not_now' | 'not_interested'
ALTER TABLE contacts ADD COLUMN reply_outcome TEXT;

CREATE INDEX idx_contacts_email_status ON contacts(email_status);

-- ------------------------------------------------------ webhook idempotency
-- Providers retry, and a retried bounce must not be processed twice. The
-- provider's own event id is the key.
CREATE TABLE webhook_events (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  kind        TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_webhook_events_time ON webhook_events(received_at);

-- ------------------------------------------------------------------ alerts
-- Written to the database FIRST and emailed second, on purpose: outbound email
-- is exactly the thing most likely to be unconfigured or broken when something
-- worth alerting about happens. An alert nobody can see is not an alert.
CREATE TABLE alerts (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  summary         TEXT NOT NULL,
  detail          TEXT,
  user_id         TEXT,
  user_name       TEXT NOT NULL DEFAULT '',
  emailed         INTEGER NOT NULL DEFAULT 0,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_alerts_open ON alerts(acknowledged_at, created_at);
