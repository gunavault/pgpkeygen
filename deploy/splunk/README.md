# Splunk key-expiry monitoring: deployment files

See [`docs/splunk-monitoring.md`](../../docs/splunk-monitoring.md) for the full setup.

- `splunk-role.sql`: creates the read-only `splunk_ro` role. Covered by
  `tests/soc-key-expiry-view.test.ts` against a live PostgreSQL server.
- `docker-compose.yml`: example production compose with Postgres published on a private IP
  only, TLS on, and a fixed IP for the app container. Caddy is unchanged.
- `pg_hba.conf`: admits the `pgpkeygen` superuser only from the app container, and
  `splunk_ro` only from the Splunk server over TLS.

**The compose and `pg_hba.conf` files are untested examples.** `10.0.0.5` (database server's
private IP) and `10.0.0.20` (Splunk server) are placeholders. Run the verification steps in
the docs after deploying.
