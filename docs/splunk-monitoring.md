# Key expiry monitoring in Splunk

The SOC team can watch every stored key's expiry from Splunk without any access to key
material. Splunk DB Connect logs in as a dedicated read-only role, `splunk_ro`, which can
read one view, `soc_key_expiry`, and nothing else.

## What Splunk sees

`soc_key_expiry` (created by migration `0006_soc_key_expiry`) has one row per stored key:

| Column | Meaning |
|---|---|
| `key_id` | Stable id of the key row |
| `title` | Title the owner gave the key |
| `fingerprint` | PGP fingerprint |
| `algorithm` | Key algorithm |
| `owner_email` | Account that owns the key |
| `created_at` | When the key was stored |
| `expires_at` | Expiry read from the public key when it was stored; `NULL` = never expires |
| `revoked_at` | When the owner revoked it; `NULL` = not revoked |
| `expiry_status` | `revoked`, `never`, `expired`, `expiring` (within 30 days) or `healthy` |
| `days_remaining` | Calendar days until expiry in the server's time zone; negative once expired |

`revoked` takes precedence, so a revoked key never raises an expiry alert.

`splunk_ro` cannot read `pgp_keys`, `users` or `audit_log` directly, so private keys,
escrowed passphrases, revocation certificates and password hashes stay out of Splunk.
`tests/soc-key-expiry-view.test.ts` checks this against a live PostgreSQL server.

### Limits

- `expires_at` is recorded when a key is saved and never refreshed. If an owner extends a
  key's expiry outside the app, Splunk keeps showing the old date.
- A deleted key disappears from the view. Deletions are recorded in `audit_log`
  (`key.deleted`), which this role cannot read.
- The view depends on `pgp_keys.title`, `expires_at`, `revoked_at` and the other columns it
  selects. A future migration that drops or changes one of them must recreate the view, or
  the migration fails and the app container will not start.

## Setup

### 1. Create the view

Releases that include migration `0006_soc_key_expiry` create it on startup. On an older
image (such as `1.1.0`), create it by hand from a checkout of this repository:

```sh
docker compose exec -T db psql -U pgpkeygen -d pgpkeygen < drizzle/0006_soc_key_expiry.sql
```

The migration uses `CREATE OR REPLACE`, so upgrading later still applies cleanly.

### 2. Create the read-only role

```sh
docker compose exec -T db psql -U pgpkeygen -d pgpkeygen < deploy/splunk/splunk-role.sql
docker compose exec db psql -U pgpkeygen -d pgpkeygen -c '\password splunk_ro'
```

`\password` hashes the password in psql before sending it, so the plaintext never reaches
the server or its logs. Generate one with `openssl rand -base64 32`.

The script is safe to re-run. Each run removes any other table grants `splunk_ro` has
picked up and leaves only `SELECT` on the view. The role is also read-only by default,
limited to 3 connections, and has a 30-second statement timeout.

### 3. Open the database to the Splunk server only

The stock `postgres` image adds `host all all all scram-sha-256` to `pg_hba.conf`. That
admits **every** user from **any** address, including `pgpkeygen`, which is a superuser.
Publishing port 5432 without replacing that rule exposes the superuser login.

`deploy/splunk/docker-compose.yml` and `deploy/splunk/pg_hba.conf` show the required
changes: Postgres published on the private IP only, TLS on, the superuser admitted only
from the app container's fixed IP, and `splunk_ro` only from the Splunk server over TLS.
Also allow only the Splunk server's IP to reach port 5432 at the network firewall.

Deploy with `docker compose down && docker compose up -d`, because the network subnet
changes. Do not add `-v`: that deletes the database volume.

### 4. Verify before connecting Splunk

1. From the Splunk server, `psql "host=<db-ip> user=pgpkeygen dbname=pgpkeygen"` must fail
   with `no pg_hba.conf entry`. If it asks for a password, the superuser is exposed.
2. From the Splunk server,
   `psql "host=<db-ip> user=splunk_ro dbname=pgpkeygen sslmode=require" -c "select private_key from pgp_keys limit 1"`
   must fail with `permission denied`.
3. From any other host, port 5432 must time out.
4. `select usename, client_addr from pg_stat_activity` must show `splunk_ro` connecting
   from the Splunk server's IP, not the Docker gateway (`172.30.0.1`). Otherwise
   `pg_hba.conf` is not seeing real client addresses.
5. The app restarts, migrations run, and login still works.

### 5. Configure Splunk DB Connect

- **Connection:** PostgreSQL, JDBC URL
  `jdbc:postgresql://<db-ip>:5432/pgpkeygen?sslmode=require`, identity `splunk_ro`.
- **Input:** batch mode, query `SELECT * FROM soc_key_expiry`, once a day. Each run is a
  full snapshot, so alerts should use the latest run.

Example alert search (adjust index and sourcetype to your input):

```
index=pgp sourcetype=pgp:key_expiry expiry_status IN ("expired","expiring")
| stats latest(days_remaining) AS days_remaining latest(expiry_status) AS status
        BY title, owner_email, fingerprint
| sort days_remaining
```
