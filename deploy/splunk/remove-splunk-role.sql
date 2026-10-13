-- Phase 3 of the Splunk-to-Wazuh migration (docs/wazuh-monitoring.md):
-- removes the splunk_ro login once Splunk no longer reads key expiry.
-- Run as the database owner, in the pgpkeygen database:
--
--   docker compose exec -T db psql -U pgpkeygen -d pgpkeygen -v ON_ERROR_STOP=1 < splunk/remove-splunk-role.sql
--
-- Safe to re-run. Ends any open Splunk session first, so DB Connect cannot
-- keep reading through a connection it already holds. The soc_key_expiry view
-- stays: the Wazuh export reads it.

SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'splunk_ro';

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'splunk_ro') THEN
    EXECUTE 'DROP OWNED BY splunk_ro';
    EXECUTE 'DROP ROLE splunk_ro';
  END IF;
END
$$;
