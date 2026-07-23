-- Retarget the taxonomy to procurement and supply-chain digitalisation.
--
-- The launch seed was generic. This replaces skills and industries with lists
-- specific to the pool the firm actually recruits — project / change managers,
-- functional consultants and technical consultants around procurement and
-- supply-chain tools — and adds the eProcurement and supply-chain certifications
-- alongside the project/change ones seeded in 0011.
--
-- Safe to replace outright: skills and industries are stored on profiles as
-- JSON labels, never as foreign keys, and there is no live profile data yet.
-- All of it stays editable in Settings.

DELETE FROM taxonomy WHERE kind IN ('skill', 'industry');

-- ---------------------------------------------------------------- industries
INSERT INTO taxonomy (id, kind, label, sort) VALUES
  ('in-pharma',   'industry', 'Pharma & life sciences', 10),
  ('in-biotech',  'industry', 'Biotechnology', 20),
  ('in-meddev',   'industry', 'Medical devices', 30),
  ('in-chem',     'industry', 'Chemicals & petrochemicals', 40),
  ('in-cosm',     'industry', 'Cosmetics & personal care', 50),
  ('in-food',     'industry', 'Food & beverage', 60),
  ('in-fmcg',     'industry', 'FMCG / consumer packaged goods', 70),
  ('in-retail',   'industry', 'Retail', 80),
  ('in-ecom',     'industry', 'E-commerce', 90),
  ('in-autooem',  'industry', 'Automotive (OEM)', 100),
  ('in-autosup',  'industry', 'Automotive & mobility suppliers', 110),
  ('in-aero',     'industry', 'Aerospace & defense', 120),
  ('in-machin',   'industry', 'Industrial equipment & machinery', 130),
  ('in-hitech',   'industry', 'Electronics & high-tech', 140),
  ('in-semi',     'industry', 'Semiconductors', 150),
  ('in-energy',   'industry', 'Energy & utilities', 160),
  ('in-oilgas',   'industry', 'Oil & gas', 170),
  ('in-renew',    'industry', 'Renewable energy', 180),
  ('in-constr',   'industry', 'Construction & engineering', 190),
  ('in-buildmat', 'industry', 'Building materials', 200),
  ('in-metals',   'industry', 'Metals & mining', 210),
  ('in-logi',     'industry', 'Transport & logistics', 220),
  ('in-telecom',  'industry', 'Telecommunications', 230),
  ('in-bank',     'industry', 'Banking & financial services', 240),
  ('in-insur',    'industry', 'Insurance', 250),
  ('in-public',   'industry', 'Public sector & government', 260),
  ('in-health',   'industry', 'Healthcare providers', 270),
  ('in-edu',      'industry', 'Education & research', 280),
  ('in-agri',     'industry', 'Agriculture & agrifood', 290),
  ('in-textile',  'industry', 'Textile & apparel', 300),
  ('in-paper',    'industry', 'Paper & packaging', 310),
  ('in-water',    'industry', 'Water & waste management', 320),
  ('in-realest',  'industry', 'Real estate & facilities', 330);

-- -------------------------------------------------------------------- skills
-- Delivery & change
INSERT INTO taxonomy (id, kind, label, sort) VALUES
  ('sk-pm',      'skill', 'Project management', 10),
  ('sk-prog',    'skill', 'Programme management', 20),
  ('sk-pmo',     'skill', 'PMO setup & governance', 30),
  ('sk-chg',     'skill', 'Change management (Prosci / ADKAR)', 40),
  ('sk-bpr',     'skill', 'Business process re-engineering', 50),
  ('sk-agile',   'skill', 'Agile / Scrum delivery', 60),
  ('sk-stake',   'skill', 'Stakeholder management', 70),
  ('sk-adopt',   'skill', 'Training & user adoption', 80),
  ('sk-reqs',    'skill', 'Requirements gathering', 90),
  ('sk-value',   'skill', 'Business case & value realisation', 100),
-- Procurement (functional)
  ('sk-s2p',     'skill', 'Source-to-Pay (S2P)', 200),
  ('sk-p2p',     'skill', 'Procure-to-Pay (P2P)', 210),
  ('sk-s2c',     'skill', 'Source-to-Contract (S2C)', 220),
  ('sk-sourcing','skill', 'Strategic sourcing', 230),
  ('sk-category','skill', 'Category management', 240),
  ('sk-srm',     'skill', 'Supplier relationship management (SRM)', 250),
  ('sk-clm',     'skill', 'Contract lifecycle management (CLM)', 260),
  ('sk-spend',   'skill', 'Spend analytics & classification', 270),
  ('sk-esourc',  'skill', 'eSourcing', 280),
  ('sk-eproc',   'skill', 'eProcurement / catalogue management', 290),
  ('sk-sim',     'skill', 'Supplier onboarding & information management (SIM)', 300),
  ('sk-proctf',  'skill', 'Procurement transformation', 310),
  ('sk-direct',  'skill', 'Direct procurement', 320),
  ('sk-indirect','skill', 'Indirect procurement', 330),
  ('sk-tprm',    'skill', 'Third-party & supplier risk management', 340),
  ('sk-esg',     'skill', 'Sustainable / ESG procurement', 350),
-- Supply chain (functional)
  ('sk-scplan',  'skill', 'Supply chain planning', 400),
  ('sk-demand',  'skill', 'Demand planning & forecasting', 410),
  ('sk-sop',     'skill', 'Sales & Operations Planning (S&OP)', 420),
  ('sk-ibp',     'skill', 'Integrated Business Planning (IBP)', 430),
  ('sk-invent',  'skill', 'Inventory optimisation', 440),
  ('sk-wms',     'skill', 'Warehouse management (WMS)', 450),
  ('sk-tms',     'skill', 'Transport management (TMS)', 460),
  ('sk-network', 'skill', 'Logistics network design', 470),
  ('sk-order',   'skill', 'Order management', 480),
  ('sk-ctrltwr', 'skill', 'Supply chain control tower / visibility', 490),
  ('sk-prodpl',  'skill', 'Production planning', 500),
-- Technical / data
  ('sk-funcan',  'skill', 'Functional analysis', 600),
  ('sk-solarch', 'skill', 'Solution architecture', 610),
  ('sk-datamig', 'skill', 'Data migration', 620),
  ('sk-mdm',     'skill', 'Master data management (MDM)', 630),
  ('sk-integ',   'skill', 'Systems integration (API / middleware / EDI)', 640),
  ('sk-report',  'skill', 'Reporting & dashboards (Power BI / Tableau / SAC)', 650),
  ('sk-uat',     'skill', 'Test management & UAT', 660),
  ('sk-rpa',     'skill', 'RPA & workflow automation', 670),
  ('sk-aianalytics', 'skill', 'AI / analytics for supply chain', 680);

-- ------------------------------------------------------ more certifications
-- Procurement & supply-chain professional bodies
INSERT INTO taxonomy (id, kind, label, sort) VALUES
  ('ce-cips4',    'certification', 'CIPS Level 4 Diploma in Procurement & Supply', 200),
  ('ce-cips6',    'certification', 'CIPS Level 6 Professional Diploma', 205),
  ('ce-cpsm',     'certification', 'CPSM (ISM Certified Professional in Supply Management)', 210),
  ('ce-cpim',     'certification', 'CPIM (ASCM Planning & Inventory Management)', 215),
  ('ce-cscp',     'certification', 'CSCP (ASCM Certified Supply Chain Professional)', 220),
  ('ce-cltd',     'certification', 'CLTD (ASCM Logistics, Transportation & Distribution)', 225),
  ('ce-scorp',    'certification', 'SCOR-P (ASCM SCOR Professional)', 230),
-- eProcurement / Source-to-Pay tools
  ('ce-aribasrc', 'certification', 'SAP Ariba Sourcing', 300),
  ('ce-aribabuy', 'certification', 'SAP Ariba Buying & Invoicing', 305),
  ('ce-aribactr', 'certification', 'SAP Ariba Contracts', 310),
  ('ce-aribascc', 'certification', 'SAP Ariba Supply Chain Collaboration', 315),
  ('ce-s4proc',   'certification', 'SAP S/4HANA Sourcing & Procurement', 320),
  ('ce-coupa',    'certification', 'Coupa Certified Professional', 325),
  ('ce-coupasm',  'certification', 'Coupa Spend Management', 330),
  ('ce-ivalua',   'certification', 'Ivalua Certified Consultant', 335),
  ('ce-jaggaer',  'certification', 'Jaggaer Certified Consultant', 340),
  ('ce-gep',      'certification', 'GEP SMART Certified', 345),
  ('ce-oracleproc','certification', 'Oracle Procurement Cloud Certified', 350),
  ('ce-zycus',    'certification', 'Zycus Certified', 355),
  ('ce-basware',  'certification', 'Basware Certified', 360),
-- Supply-chain planning & execution tools
  ('ce-ibp',      'certification', 'SAP IBP (Integrated Business Planning)', 400),
  ('ce-ewm',      'certification', 'SAP EWM (Extended Warehouse Management)', 405),
  ('ce-saptm',    'certification', 'SAP TM (Transportation Management)', 410),
  ('ce-kinaxa1',  'certification', 'Kinaxis RapidResponse Author Level 1', 415),
  ('ce-kinaxa2',  'certification', 'Kinaxis RapidResponse Author Level 2', 420),
  ('ce-kinaxa3',  'certification', 'Kinaxis RapidResponse Author Level 3', 425),
  ('ce-kinaxadm', 'certification', 'Kinaxis RapidResponse Administrator', 430),
  ('ce-o9',       'certification', 'o9 Solutions Certified', 435),
  ('ce-blueyond', 'certification', 'Blue Yonder Luminate Certified', 440),
  ('ce-anaplanmb','certification', 'Anaplan Certified Model Builder', 445),
  ('ce-anaplansa','certification', 'Anaplan Solution Architect', 450),
  ('ce-omp',      'certification', 'OMP Certified', 455),
  ('ce-manhattan','certification', 'Manhattan Associates Certified', 460),
-- Data, analytics & automation
  ('ce-pbi',      'certification', 'Microsoft Power BI Data Analyst (PL-300)', 500),
  ('ce-tableau',  'certification', 'Tableau Desktop Specialist', 505),
  ('ce-sac',      'certification', 'SAP Analytics Cloud (SAC)', 510),
  ('ce-uipath',   'certification', 'UiPath RPA Certified', 515),
  ('ce-blueprism','certification', 'Blue Prism Certified', 520);
