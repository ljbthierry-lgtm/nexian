-- Make the append-only promise real, and index the queries the app actually runs.
--
-- `consents` carries a comment saying it must never be updated or deleted,
-- because it is what proves a person agreed to be contacted. It also carried
-- ON DELETE CASCADE from `contacts`, so a single `DELETE FROM contacts` would
-- have erased exactly that proof — silently, and precisely for the person whose
-- record was in question. Nothing in the app deletes a contact today (both the
-- portal delete and the retention sweep anonymise in place), but the obvious
-- next feature is an admin delete button, and it would have fired the cascade.
--
-- Triggers rather than a table rebuild: SQLite cannot alter a foreign key in
-- place, and a rebuild of a live evidence table is a worse risk than the one it
-- would close. A cascade that reaches these rows now aborts the whole delete,
-- which is the behaviour we want — loud, not quiet.

CREATE TRIGGER consents_are_append_only
BEFORE DELETE ON consents
BEGIN
  SELECT RAISE(
    ABORT,
    'consents is append-only: anonymise the contact instead of deleting it'
  );
END;

CREATE TRIGGER consents_never_change
BEFORE UPDATE ON consents
BEGIN
  SELECT RAISE(
    ABORT,
    'consents is append-only: record a new decision instead of editing an old one'
  );
END;

CREATE TRIGGER activity_is_append_only
BEFORE DELETE ON activity
BEGIN
  SELECT RAISE(
    ABORT,
    'activity is the accountability trail: anonymise the contact instead of deleting it'
  );
END;

-- ------------------------------------------------------------------ indexes
-- The back-office list orders every page load by this column.
CREATE INDEX idx_contacts_updated ON contacts(updated_at);
-- The pool table orders by this one.
CREATE INDEX idx_profiles_updated ON profiles(updated_at);
-- Nearly every WHERE in the app excludes anonymised records.
CREATE INDEX idx_contacts_anonymized ON contacts(anonymized_at);
-- The admin email log reads newest-first across all contacts, which the existing
-- (contact_id, created_at) index cannot serve.
CREATE INDEX idx_email_log_created ON email_log(created_at);
