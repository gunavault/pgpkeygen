# Key expiry monitoring in Wazuh (and moving off Splunk)

Wazuh gets the same key-expiry data Splunk gets: one record per stored key, from the
read-only `soc_key_expiry` view, with no access to key material. This page covers what
Wazuh receives, how to install it, how to run it next to Splunk, and how to retire Splunk
afterwards. Every file is on this page; paste the blocks in order.

```
PostgreSQL ── soc_key_expiry view
   ├── Splunk DB Connect ── splunk_ro, TLS 5432 ────────────────► Splunk   (until phase 3)
   └── daily export (systemd timer, wazuh_ro, local socket)
          └── /var/log/pgpkeygen/key-expiry.json ── Wazuh agent ──► Wazuh manager
```

## What Wazuh receives

A systemd timer runs `export-key-expiry.sh` every day at 06:52 (Asia/Jakarta). It appends
JSON lines to `/var/log/pgpkeygen/key-expiry.json`, which the Wazuh agent reads:

- one **`key_expiry`** line per key, with the view's own columns (the same names Splunk
  sees: `key_id`, `title`, `fingerprint`, `algorithm`, `owner_email`, `created_at`,
  `expires_at`, `revoked_at`, `expiry_status`, `days_remaining`) plus `app`,
  `event_type` and `exported_at`;
- one **`export_summary`** line per run: `keys_total` and a count per status;
- an **`export_failed`** line if a run fails, so a broken feed raises an alert instead of
  going quiet.

Example:

```json
{"app" : "pgpkeygen", "event_type" : "key_expiry", "exported_at" : "2026-10-13T23:52:00Z", "key_id" : "ad75…", "title" : "Release signing key", "fingerprint" : "…", "algorithm" : "ed25519", "owner_email" : "ops@example.com", "created_at" : "2025-10-20T03:10:00+00:00", "expires_at" : "2026-10-18T03:10:00+00:00", "revoked_at" : null, "expiry_status" : "expiring", "days_remaining" : 5}
{"app" : "pgpkeygen", "event_type" : "export_summary", "exported_at" : "2026-10-13T23:52:00Z", "keys_total" : 42, "expired" : 1, "expiring" : 3, "revoked" : 2, "healthy" : 30, "never" : 6}
```

The format is plain JSON lines on purpose, not tied to Wazuh: any collector that reads
JSON lines can use the same file.

### Who can read what

- The export logs in as **`wazuh_ro`**, which can read the `soc_key_expiry` view and
  nothing else, in read-only sessions. It has **no password and no `pg_hba.conf` line**: it
  can only connect over the database container's local socket (`docker compose exec`), so
  nothing reaches it over the network and no port is opened for Wazuh.
- The file is written `0640 root:root`. The Wazuh agent's log collector runs as root and
  can read it.
- Titles and emails are JSON-escaped, so a key title cannot break a line or forge an event.

### Rules and levels

| Rule | Level | When |
|---|---|---|
| 100505 | 10 | `expired`: past its expiry and not revoked |
| 100504 | 9 | `expiring` in 7 days or fewer |
| 100503 | 7 | `expiring` (within 30 days) |
| 100507 | 12 | an export run failed: the snapshot is stale |
| 100501 / 100508 / 100502 | 3 | `healthy` / no expiry date / `revoked`: inventory only |
| 100506 | 3 | daily summary |

Rule IDs 100500–100509 are used; change them if your manager already uses that range.
Level 3 events are stored as alerts so the inventory can be searched in the Wazuh dashboard.
To keep only real alerts, change those rules to level 0.

### Limits

The same as Splunk's (see `docs/splunk-monitoring.md`): `expires_at` is what the key said
when it was saved, a deleted key simply stops appearing, and changes to the columns the view
reads need the view recreated. Each run is a full snapshot: alert on the latest day.

## The migration in three phases

### Phase 1: both, Splunk stays in charge

Install the Wazuh feed (below). Keep the Splunk alerts as they are, and compare every day:

| Splunk (today) | Wazuh (new) | They match when |
|---|---|---|
| alert on `expiry_status="expired"` | rule 100505 | the same fingerprints appear |
| alert on `expiry_status="expiring"` | rules 100503 / 100504 | the same fingerprints appear |
| inventory of all keys | rules 100501, 100502, 100508 | same count of keys |
| (DB Connect errors, in Splunk's own logs) | rule 100507 | n/a: new in Wazuh |

A quick daily check: the Wazuh summary (rule 100506, `data.keys_total`, `data.expired`,
`data.expiring`) against this Splunk search over the latest DB Connect run:

```
index=pgp sourcetype=pgp:key_expiry earliest=-1d
| stats count AS keys_total count(eval(expiry_status="expired")) AS expired
        count(eval(expiry_status="expiring")) AS expiring
```

Run DB Connect close to 06:52 so both look at the same moment; keys changed in between make
the numbers differ for a day. Agree with the SOC how long the two must match (for example 14
days) before moving on.

### Phase 2: Wazuh takes over alerting

Turn the Splunk alerts off. Nothing changes on the pgpkeygen server. Splunk can keep the
data for reports until phase 3.

### Phase 3: retire Splunk's access

Done on the pgpkeygen server once Splunk no longer needs the data; see
[Retire Splunk](#retire-splunk-phase-3) below. Afterwards no SIEM connects to the database
over the network.

## Install

Wazuh agent: this assumes the server running pgpkeygen already has a Wazuh 4.x agent
enrolled with your manager. The rules were tested on Wazuh 4.9.2.

### 1. On the pgpkeygen server: the files

```bash
export APP_DIR=/opt/pgpkeygen
mkdir -p "$APP_DIR/wazuh" && cd "$APP_DIR"
```

`wazuh/wazuh-role.sql`, the read-only role:

```bash
cat > wazuh/wazuh-role.sql <<'EOF'
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
EOF
```

`wazuh/export-key-expiry.sql`, the query:

```bash
cat > wazuh/export-key-expiry.sql <<'EOF'
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
EOF
```

`wazuh/export-key-expiry.sh`, the export:

```bash
cat > wazuh/export-key-expiry.sh <<'EOF'
#!/usr/bin/env bash
# Appends today's key-expiry snapshot to a JSON-lines file for the Wazuh agent
# (or any collector that reads JSON lines). Run daily by
# pgpkeygen-key-expiry-export.timer.
#
# Reads only the soc_key_expiry view, as the read-only wazuh_ro role, over the
# database container's local socket: no network connection to Postgres.
#
# Settings (environment variables, all optional):
#   COMPOSE_FILE_PATH  docker-compose.yml of the deployment   (/opt/pgpkeygen/docker-compose.yml)
#   EXPORT_FILE        where the JSON lines are appended       (/var/log/pgpkeygen/key-expiry.json)
#   POSTGRES_DB        database name                           (pgpkeygen)
#   EXPORT_DATABASE_URL  connect with psql to this URL instead of through
#                      docker compose; for installs without Docker, and tests.
set -euo pipefail

COMPOSE_FILE_PATH=${COMPOSE_FILE_PATH:-/opt/pgpkeygen/docker-compose.yml}
EXPORT_FILE=${EXPORT_FILE:-/var/log/pgpkeygen/key-expiry.json}
POSTGRES_DB=${POSTGRES_DB:-pgpkeygen}
SQL_FILE=$(dirname "$(readlink -f "$0")")/export-key-expiry.sql

run_psql() {
  if [[ -n "${EXPORT_DATABASE_URL:-}" ]]; then
    psql "$EXPORT_DATABASE_URL" "$@"
  else
    docker compose -f "$COMPOSE_FILE_PATH" exec -T db psql -U wazuh_ro -d "$POSTGRES_DB" "$@"
  fi
}

umask 027
mkdir -p "$(dirname "$EXPORT_FILE")"
tmp=$(mktemp "$EXPORT_FILE.XXXXXX")
trap 'rm -f "$tmp"' EXIT

# A failed run is written to the feed too, so the SIEM alerts on it instead of
# the snapshot silently going stale. The reason is a fixed word, never psql's
# error text, so the line is always valid JSON.
report_failure() {
  printf '{"app":"pgpkeygen","event_type":"export_failed","exported_at":"%s","reason":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$EXPORT_FILE"
  echo "key-expiry export failed: $1" >&2
  exit 1
}

run_psql -X -q -A -t -v ON_ERROR_STOP=1 < "$SQL_FILE" > "$tmp" || report_failure query_failed

# Every line must be one of our JSON objects, and the run must end with its
# summary; anything else means the output is not what the rules expect.
if grep -qv '^{"app" : "pgpkeygen", "event_type" : "' "$tmp" \
  || ! tail -n 1 "$tmp" | grep -q '"event_type" : "export_summary"'; then
  report_failure unexpected_output
fi

# One append of complete lines, so a collector never reads half a snapshot line.
cat "$tmp" >> "$EXPORT_FILE"
EOF
chmod 750 wazuh/export-key-expiry.sh
```

The systemd service, timer and log rotation:

```bash
cat > /etc/systemd/system/pgpkeygen-key-expiry-export.service <<'EOF'
# Writes the daily key-expiry snapshot for the Wazuh agent.
# Install: /etc/systemd/system/pgpkeygen-key-expiry-export.service
[Unit]
Description=Export pgpkeygen key expiry for Wazuh
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
Environment=COMPOSE_FILE_PATH=/opt/pgpkeygen/docker-compose.yml
Environment=EXPORT_FILE=/var/log/pgpkeygen/key-expiry.json
ExecStart=/opt/pgpkeygen/wazuh/export-key-expiry.sh
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
EOF

cat > /etc/systemd/system/pgpkeygen-key-expiry-export.timer <<'EOF'
# Runs the export once a day. Persistent=true catches up after downtime.
# Install: /etc/systemd/system/pgpkeygen-key-expiry-export.timer
[Unit]
Description=Daily pgpkeygen key-expiry export for Wazuh

[Timer]
OnCalendar=*-*-* 06:52:00 Asia/Jakarta
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > /etc/logrotate.d/pgpkeygen <<'EOF'
# Install: /etc/logrotate.d/pgpkeygen
# The Wazuh agent follows the rename and starts reading the new file.
/var/log/pgpkeygen/key-expiry.json {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
}
EOF
```

If your deployment is not in `/opt/pgpkeygen`, change the paths in the service file.

### 2. On the pgpkeygen server: create the role and run once

```bash
cd "$APP_DIR"
docker compose exec -T db psql -U pgpkeygen -d pgpkeygen -v ON_ERROR_STOP=1 < wazuh/wazuh-role.sql
systemctl daemon-reload
systemctl enable --now pgpkeygen-key-expiry-export.timer
systemctl start pgpkeygen-key-expiry-export.service     # one run now, instead of waiting
tail -n 2 /var/log/pgpkeygen/key-expiry.json            # expect a key line and the summary
```

### 3. On the pgpkeygen server: point the Wazuh agent at the file

Add this inside `<ossec_config>` in `/var/ossec/etc/ossec.conf`:

```xml
<!--
  Add inside <ossec_config> in /var/ossec/etc/ossec.conf on the Wazuh agent of
  the server that runs pgpkeygen, then: systemctl restart wazuh-agent
-->
<localfile>
  <log_format>json</log_format>
  <location>/var/log/pgpkeygen/key-expiry.json</location>
</localfile>
```

```bash
systemctl restart wazuh-agent
grep key-expiry.json /var/ossec/logs/ossec.log | tail -1   # expect: Analyzing file: '/var/log/pgpkeygen/key-expiry.json'
```

### 4. On the Wazuh manager: the rules

```bash
cat > /var/ossec/etc/rules/pgpkeygen_rules.xml <<'EOF'
<!--
  pgpkeygen key-expiry rules for the Wazuh manager.
  Install: /var/ossec/etc/rules/pgpkeygen_rules.xml, then restart the manager.

  Input: JSON lines from export-key-expiry.sh, read by the agent with
  <log_format>json</log_format>. One "key_expiry" event per key per day, one
  "export_summary" per run, and "export_failed" when a run fails.

  Levels match the Splunk alert (expiry_status IN ("expired","expiring")) so
  the two can be compared during the parallel run:
    expired 10, expiring within 7 days 9, expiring 7, export failed 12,
    revoked / healthy / never / summary 3 (inventory, no alerting).
  Rule IDs 100500-100509 are reserved for pgpkeygen; change them if your
  manager already uses that range.
-->
<group name="pgpkeygen,key_expiry,">

  <rule id="100500" level="0">
    <decoded_as>json</decoded_as>
    <field name="app">^pgpkeygen$</field>
    <description>pgpkeygen events.</description>
  </rule>

  <rule id="100501" level="3">
    <if_sid>100500</if_sid>
    <field name="event_type">^key_expiry$</field>
    <field name="expiry_status">^healthy$</field>
    <description>pgpkeygen: key "$(title)" of $(owner_email) is healthy ($(days_remaining) days left).</description>
  </rule>

  <rule id="100508" level="3">
    <if_sid>100500</if_sid>
    <field name="event_type">^key_expiry$</field>
    <field name="expiry_status">^never$</field>
    <description>pgpkeygen: key "$(title)" of $(owner_email) has no expiry date.</description>
  </rule>

  <rule id="100502" level="3">
    <if_sid>100500</if_sid>
    <field name="event_type">^key_expiry$</field>
    <field name="expiry_status">^revoked$</field>
    <description>pgpkeygen: key "$(title)" of $(owner_email) is revoked.</description>
  </rule>

  <rule id="100503" level="7">
    <if_sid>100500</if_sid>
    <field name="event_type">^key_expiry$</field>
    <field name="expiry_status">^expiring$</field>
    <description>pgpkeygen: key "$(title)" of $(owner_email) expires in $(days_remaining) days.</description>
  </rule>

  <rule id="100504" level="9">
    <if_sid>100503</if_sid>
    <field name="days_remaining" type="pcre2">^[0-7]$</field>
    <description>pgpkeygen: key "$(title)" of $(owner_email) expires in $(days_remaining) days.</description>
  </rule>

  <rule id="100505" level="10">
    <if_sid>100500</if_sid>
    <field name="event_type">^key_expiry$</field>
    <field name="expiry_status">^expired$</field>
    <description>pgpkeygen: key "$(title)" of $(owner_email) has expired and is not revoked.</description>
  </rule>

  <rule id="100506" level="3">
    <if_sid>100500</if_sid>
    <field name="event_type">^export_summary$</field>
    <description>pgpkeygen: key-expiry export ran: $(keys_total) keys, $(expired) expired, $(expiring) expiring.</description>
  </rule>

  <rule id="100507" level="12">
    <if_sid>100500</if_sid>
    <field name="event_type">^export_failed$</field>
    <description>pgpkeygen: key-expiry export failed ($(reason)); the snapshot is stale.</description>
  </rule>

</group>
EOF
chown wazuh:wazuh /var/ossec/etc/rules/pgpkeygen_rules.xml
chmod 660 /var/ossec/etc/rules/pgpkeygen_rules.xml
/var/ossec/bin/wazuh-analysisd -t && systemctl restart wazuh-manager
```

`wazuh-analysisd -t` checks the rules before the restart; fix any error it prints first.

## Verify

On the pgpkeygen server:

```bash
cd "$APP_DIR"
# 1. wazuh_ro must not read key material. Expect: permission denied for table pgp_keys
docker compose exec -T db psql -U wazuh_ro -d pgpkeygen -c "select private_key from pgp_keys limit 1"
# 2. wazuh_ro can read the view. Expect: a count
docker compose exec -T db psql -U wazuh_ro -d pgpkeygen -c "select count(*) from soc_key_expiry"
# 3. The timer is scheduled. Expect: a NEXT time tomorrow 06:52 (local)
systemctl list-timers pgpkeygen-key-expiry-export.timer
```

On the Wazuh manager, after the agent has read the file:

```bash
grep '"pgpkeygen"' /var/ossec/logs/alerts/alerts.json | tail -n 3
```

To test the rules without waiting, paste one line of the export into
`/var/ossec/bin/wazuh-logtest`; it prints the rule and level that would fire.

## Retire Splunk (phase 3)

Only after phase 2, on the pgpkeygen server:

```bash
cd "$APP_DIR"
cat > splunk-remove-role.sql <<'EOF'
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
EOF
docker compose exec -T db psql -U pgpkeygen -d pgpkeygen -v ON_ERROR_STOP=1 < splunk-remove-role.sql
```

Then close the network path Splunk used, which nothing else needs any more:

1. In `pg_hba.conf`, delete the `hostssl  pgpkeygen  splunk_ro …` line.
2. In `docker-compose.yml`, under `db:`, delete the `ports:` entry `"<server-ip>:5432:5432"`
   (and its comment). The app reaches the database over the internal Docker network, and the
   Wazuh export over the local socket.
3. Apply both: `docker compose up -d db` (recreates the db container; the data volume stays).
4. On the network firewall, remove the rule that allows the Splunk IP to port 5432.
5. In Splunk, delete the DB Connect input, connection and identity.

Check: `docker compose exec -T db psql -U pgpkeygen -d pgpkeygen -c "select 1 from pg_roles where rolname = 'splunk_ro'"`
returns 0 rows, and port 5432 is no longer listening on the server's IP
(`ss -ltn | grep 5432` shows nothing). Run the Wazuh export once more to confirm it still works.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `journalctl -u pgpkeygen-key-expiry-export` shows `role "wazuh_ro" does not exist` | Step 2 was skipped: run `wazuh-role.sql`. |
| Wazuh alert 100507 `query_failed` | The export could not query the database: the db container was down, or the view or role is missing. Run the service by hand and read `journalctl -u pgpkeygen-key-expiry-export`. |
| Wazuh alert 100507 `unexpected_output` | psql printed something that is not one of the export's JSON lines; usually a changed `export-key-expiry.sql`. Restore it from this page. |
| The file grows but no alerts arrive | The agent is not reading it (step 3), or the rules are not loaded (step 4). Test one line with `wazuh-logtest`. |
| Alerts arrive but show `decoder: json` with no `pgpkeygen` rule | The rules file is missing on the manager or failed `wazuh-analysisd -t`. |
