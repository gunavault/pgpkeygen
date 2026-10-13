# Splunk key-expiry monitoring: deployment files

To deploy, follow [`docs/deploy.md`](../../docs/deploy.md). It contains every file below
verbatim, so nothing has to be copied from here by hand.

- `splunk-role.sql`: creates the read-only `splunk_ro` role. Covered by
  `tests/soc-key-expiry-view.test.ts` against a live PostgreSQL server.
- `docker-compose.yml`: example production compose with Postgres published on a private IP
  only, TLS on, and a fixed IP for the app container. Caddy is unchanged.
- `pg_hba.conf`: admits the `pgpkeygen` superuser only from the app container, and
  `splunk_ro` only from the Splunk server over TLS.
- `Caddyfile`: TLS termination with your own certificate, proxying to the app.

`__SERVER_IP__`, `__SPLUNK_IP__`, `__DOMAIN__` and `__IMAGE_TAG__` are placeholders; step 4e of
the guide fills them in.

What has been tested, outside Docker: the `pg_hba.conf` rules and Postgres TLS with a
certificate chain on PostgreSQL 16, and the `Caddyfile` on Caddy 2.10 (including that it
overwrites a spoofed `X-Forwarded-For`). The compose file has been run on one RHEL server. Run the
verification steps in the docs after deploying.

If you change a file here, update the matching block in `docs/deploy.md` so the two stay identical.
