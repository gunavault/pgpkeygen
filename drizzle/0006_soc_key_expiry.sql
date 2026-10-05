-- Read-only projection of key expiry for SOC monitoring (Splunk DB Connect).
-- Exposes titles, expiry and ownership only. Never add private_key, public_key,
-- escrow_*, revocation_certificate or any users column other than email here:
-- splunk_ro can read every column of this view.
-- CREATE OR REPLACE so this applies cleanly where the view was created by hand
-- before the release that ships this migration.
CREATE OR REPLACE VIEW "soc_key_expiry" AS
SELECT
  k.id AS key_id,
  k.title,
  k.fingerprint,
  k.algorithm,
  u.email AS owner_email,
  k.created_at,
  k.expires_at,
  k.revoked_at,
  CASE
    WHEN k.revoked_at IS NOT NULL THEN 'revoked'
    WHEN k.expires_at IS NULL THEN 'never'
    WHEN k.expires_at <= now() THEN 'expired'
    WHEN k.expires_at <= now() + interval '30 days' THEN 'expiring'
    ELSE 'healthy'
  END AS expiry_status,
  (k.expires_at::date - current_date) AS days_remaining
FROM "pgp_keys" k
JOIN "users" u ON u.id = k.user_id;
