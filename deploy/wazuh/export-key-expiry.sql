-- One JSON object per line: a "key_expiry" line for every row of soc_key_expiry,
-- then one "export_summary" line. Run by export-key-expiry.sh as wazuh_ro.
--
-- The output is SIEM-neutral on purpose: field names are the view's own (the
-- same ones Splunk DB Connect sees), plus "app", "event_type" and
-- "exported_at". Any collector that reads JSON lines can use it.
--
-- json_build_object escapes every value, so a key title cannot break a line
-- or inject a second event.

SET TIME ZONE 'UTC';

WITH snapshot AS (
  SELECT * FROM soc_key_expiry
), run AS (
  SELECT to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS exported_at
)
SELECT line FROM (
  SELECT 1 AS part, s.expires_at, s.key_id::text AS key_id,
         json_build_object(
           'app', 'pgpkeygen',
           'event_type', 'key_expiry',
           'exported_at', run.exported_at,
           'key_id', s.key_id,
           'title', s.title,
           'fingerprint', s.fingerprint,
           'algorithm', s.algorithm,
           'owner_email', s.owner_email,
           'created_at', s.created_at,
           'expires_at', s.expires_at,
           'revoked_at', s.revoked_at,
           'expiry_status', s.expiry_status,
           'days_remaining', s.days_remaining
         )::text AS line
  FROM snapshot s CROSS JOIN run
  UNION ALL
  SELECT 2, NULL, NULL,
         json_build_object(
           'app', 'pgpkeygen',
           'event_type', 'export_summary',
           'exported_at', run.exported_at,
           'keys_total', count(s.key_id),
           'expired', count(s.key_id) FILTER (WHERE s.expiry_status = 'expired'),
           'expiring', count(s.key_id) FILTER (WHERE s.expiry_status = 'expiring'),
           'revoked', count(s.key_id) FILTER (WHERE s.expiry_status = 'revoked'),
           'healthy', count(s.key_id) FILTER (WHERE s.expiry_status = 'healthy'),
           'never', count(s.key_id) FILTER (WHERE s.expiry_status = 'never')
         )::text
  FROM run LEFT JOIN snapshot s ON true
  GROUP BY run.exported_at
) lines
ORDER BY part, expires_at NULLS LAST, key_id;
