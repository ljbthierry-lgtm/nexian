-- Work regime, notice period, and certifications.
--
-- Regime (full-time / part-time, both allowed) and notice period are small
-- fixed enums validated in code. Certifications behave like skills: an
-- admin-curated list that drives the form's picker but accepts extras, so they
-- join the `taxonomy` table under a new kind — which means rebuilding its CHECK,
-- the same table-swap pattern used for the earlier enum widenings.

ALTER TABLE profiles ADD COLUMN work_regime TEXT NOT NULL DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN notice_period TEXT;
ALTER TABLE profiles ADD COLUMN certifications TEXT NOT NULL DEFAULT '[]';

-- ---- taxonomy: allow 'certification' ----
CREATE TABLE taxonomy_new (
  id      TEXT PRIMARY KEY,
  kind    TEXT NOT NULL CHECK (kind IN ('skill', 'industry', 'language', 'certification')),
  label   TEXT NOT NULL,
  sort    INTEGER NOT NULL DEFAULT 100,
  active  INTEGER NOT NULL DEFAULT 1
);
INSERT INTO taxonomy_new (id, kind, label, sort, active)
SELECT id, kind, label, sort, active FROM taxonomy;
DROP TABLE taxonomy;
ALTER TABLE taxonomy_new RENAME TO taxonomy;
CREATE UNIQUE INDEX idx_taxonomy_kind_label ON taxonomy(kind, label);

-- Common certifications for a project / change / SAP consulting pool. The list
-- is a starting point — editable in Settings, and freelancers may add their own.
INSERT INTO taxonomy (id, kind, label, sort) VALUES
  ('ce-pmp',     'certification', 'PMP (Project Management Professional)', 10),
  ('ce-capm',    'certification', 'CAPM', 15),
  ('ce-p2f',     'certification', 'PRINCE2 Foundation', 20),
  ('ce-p2p',     'certification', 'PRINCE2 Practitioner', 25),
  ('ce-adkar',   'certification', 'Prosci / ADKAR Change Management', 30),
  ('ce-apmgcm',  'certification', 'APMG Change Management', 35),
  ('ce-psm',     'certification', 'Professional Scrum Master (PSM)', 40),
  ('ce-csm',     'certification', 'Certified ScrumMaster (CSM)', 45),
  ('ce-safe',    'certification', 'SAFe Agilist', 50),
  ('ce-itil',    'certification', 'ITIL Foundation', 55),
  ('ce-lssgb',   'certification', 'Lean Six Sigma Green Belt', 60),
  ('ce-lssbb',   'certification', 'Lean Six Sigma Black Belt', 65),
  ('ce-togaf',   'certification', 'TOGAF', 70),
  ('ce-cips',    'certification', 'CIPS (Procurement)', 75),
  ('ce-sapact',  'certification', 'SAP Activate Project Manager', 100),
  ('ce-saps4f',  'certification', 'SAP S/4HANA Finance', 105),
  ('ce-sapfico', 'certification', 'SAP FICO', 110),
  ('ce-sapmm',   'certification', 'SAP MM (Materials Management)', 115),
  ('ce-sapsd',   'certification', 'SAP SD (Sales & Distribution)', 120),
  ('ce-sappp',   'certification', 'SAP PP (Production Planning)', 125),
  ('ce-sapsf',   'certification', 'SAP SuccessFactors', 130),
  ('ce-sapariba','certification', 'SAP Ariba', 135),
  ('ce-sapbw',   'certification', 'SAP BW/4HANA', 140);
