# Splunk key-expiry monitoring: deployment files

See [`docs/splunk-monitoring.md`](../../docs/splunk-monitoring.md) for the full setup.

- `splunk-role.sql`: creates the read-only `splunk_ro` role. Covered by
  `tests/soc-key-expiry-view.test.ts` against a live PostgreSQL server.
- `docker-compose.yml`: example production compose with Postgres published on a private IP
  only, TLS on, and a fixed IP for the app container. Caddy is unchanged.
- `pg_hba.conf`: admits the `pgpkeygen` superuser only from the app container, and
  `splunk_ro` only from the Splunk server over TLS.
- `Caddyfile`: TLS termination with your own certificate, proxying to the app.

`10.0.0.5` (database server's private IP), `10.0.0.20` (Splunk server) and `pgp.example.com`
are placeholders.

What has been tested, outside Docker: the `pg_hba.conf` rules and Postgres TLS with a
certificate chain on PostgreSQL 16, and the `Caddyfile` on Caddy 2.10 (including that it
overwrites a spoofed `X-Forwarded-For`). The compose file itself has not been run. Run the
verification steps in the docs after deploying.
