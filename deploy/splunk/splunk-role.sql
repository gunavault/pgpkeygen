-- Creates (or re-tightens) the read-only role Splunk DB Connect logs in as.
-- Safe to run repeatedly. Run as the database owner, after migrations:
--   docker compose exec -T db psql -U pgpkeygen -d pgpkeygen < deploy/splunk/splunk-role.sql
-- Then set its password interactively (psql hashes it client-side, so the
-- plaintext never reaches the server or its logs):
--   docker compose exec db psql -U pgpkeygen -d pgpkeygen -c '\password splunk_ro'

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'splunk_ro') THEN
    CREATE ROLE splunk_ro LOGIN;
  END IF;
END
$$;

ALTER ROLE splunk_ro LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3;
ALTER ROLE splunk_ro SET default_transaction_read_only = on;
ALTER ROLE splunk_ro SET statement_timeout = '30s';

-- Drop anything granted by hand earlier, then grant the view and nothing else.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM splunk_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM splunk_ro;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO splunk_ro', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO splunk_ro;
GRANT SELECT ON soc_key_expiry TO splunk_ro;
