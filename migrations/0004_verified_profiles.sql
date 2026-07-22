-- Double opt-in: consent only counts once the address is proven.
--
-- Registration is a public form, so anyone can submit it with somebody else's
-- address. Removing the session it used to hand out closed the data leak, but
-- one thing remained: the submission still wrote consent rows in that person's
-- name. For an application whose whole purpose is to prove that a freelancer
-- agreed to be contacted, a ledger entry someone else created is worse than no
-- entry at all.
--
-- So a profile now starts unverified. It becomes verified the moment somebody
-- opens the personal link we emailed to that address — something only the
-- mailbox owner can do. Campaign audiences require it; the recruiter-facing pool
-- still shows unverified people, clearly marked, because they are real leads.

ALTER TABLE profiles ADD COLUMN verified_at TEXT;

-- Every profile that exists at the time of this migration was created by the
-- previous flow, which signed the registrant straight in. Treat those as
-- verified rather than silently dropping them out of every audience.
UPDATE profiles SET verified_at = registered_at WHERE verified_at IS NULL;

CREATE INDEX idx_profiles_verified ON profiles(verified_at);
