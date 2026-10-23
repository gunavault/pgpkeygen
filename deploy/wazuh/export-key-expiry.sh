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
