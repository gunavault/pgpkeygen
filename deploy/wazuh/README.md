# Wazuh key-expiry monitoring: deployment files

To deploy, follow [`docs/wazuh-monitoring.md`](../../docs/wazuh-monitoring.md). It contains
every file below verbatim, so nothing has to be copied from here by hand.

- `wazuh-role.sql`: creates the read-only `wazuh_ro` role (view only, no password, local
  socket only).
- `export-key-expiry.sql`: the query; one JSON line per key plus a summary line.
- `export-key-expiry.sh`: runs the query through `docker compose exec` and appends to
  `/var/log/pgpkeygen/key-expiry.json`; writes an `export_failed` line if it cannot.
- `pgpkeygen-key-expiry-export.service` / `.timer`: runs the export daily at 06:52
  Asia/Jakarta.
- `logrotate-pgpkeygen`: weekly rotation of the export file.
- `ossec-localfile.xml`: the Wazuh agent `<localfile>` block.
- `pgpkeygen_rules.xml`: Wazuh manager rules 100500-100508.

What has been tested:

- `wazuh-role.sql`, `export-key-expiry.sql` and `export-key-expiry.sh` by
  `tests/wazuh-key-expiry-export.test.ts` against a live PostgreSQL server, including a
  failed run.
- The script's default path (`docker compose exec` into a Postgres 16 container, run from
  `/` with an empty environment, as systemd does).
- `pgpkeygen_rules.xml` and `ossec-localfile.xml` on a Wazuh 4.9.2 manager: every event
  type through `wazuh-logtest`, and the export file read by the log collector into
  `alerts.json`. The rules are not part of CI.
- The systemd units with `systemd-analyze` only; they have not run under systemd here.

If you change a file here, regenerate or update the matching block in
`docs/wazuh-monitoring.md` so the two stay identical.
