-- Structured profile fields: language proficiency, relevant experience, mobility.
--
-- `years_experience` already holds total career length; `years_relevant` is the
-- narrower, more useful number for matching — years doing the kind of work the
-- mission needs. `language_levels` grades the pool's three working languages;
-- the flat `languages` array stays, derived from the grades, so the existing
-- "speaks French" filter keeps working. `mobility` lists the Belgian regions a
-- freelancer will physically work in.

ALTER TABLE profiles ADD COLUMN years_relevant INTEGER;
ALTER TABLE profiles ADD COLUMN language_levels TEXT NOT NULL DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN mobility TEXT NOT NULL DEFAULT '[]';
