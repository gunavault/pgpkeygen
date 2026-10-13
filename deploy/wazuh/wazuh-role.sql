-- Read-only role for the Wazuh key-expiry export (deploy/wazuh/export-key-expiry.sh).
-- Run as the database owner, in the pgpkeygen database, after migrations have
-- created the soc_key_expiry view:
--
--   docker compose exec -T db psql -U pgpkeygen -d pgpkeygen -v ON_ERROR_STOP=1 < wazuh/wazuh-role.sql
--
-- Safe to re-run: it resets the role's attributes and grants every time.
--
-- wazuh_ro has no password and no pg_hba.conf line of its own. It can only
-- log in over the database container's local socket (docker compose exec),
-- which is how the export job connects. Nothing reaches it over the network.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'wazuh_ro') THEN
    CREATE ROLE wazuh_ro LOGIN;
  END IF;
END
$$;

ALTER ROLE wazuh_ro LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2 PASSWORD NULL;
ALTER ROLE wazuh_ro SET default_transaction_read_only = on;
ALTER ROLE wazuh_ro SET statement_timeout = '30s';

-- Drop anything granted by hand earlier, then grant the view and nothing else.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM wazuh_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM wazuh_ro;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO wazuh_ro', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO wazuh_ro;
GRANT SELECT ON soc_key_expiry TO wazuh_ro;
