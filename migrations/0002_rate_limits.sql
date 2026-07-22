-- Throttling for the endpoints anyone on the internet can reach.
--
-- Without this, three things are free to an attacker: guessing staff passwords,
-- creating unlimited profiles, and — the worst of the three — pointing our
-- "email me my link" form at someone else's address over and over, which turns
-- our sending domain into their spam. A counter per (bucket, identifier, window)
-- is enough to stop all three.

CREATE TABLE rate_limits (
  key         TEXT PRIMARY KEY,
  count       INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL
);

CREATE INDEX idx_rate_limits_expiry ON rate_limits(expires_at);
