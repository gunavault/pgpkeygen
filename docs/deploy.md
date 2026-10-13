# Deploying pgpkeygen (first-time guide)

This guide takes a fresh Linux server to a running pgpkeygen behind HTTPS, with the key
expiry view exposed read-only to Splunk. **Every command and every file is on this page.**
Paste each block into a root shell on the server, in order. Nothing has to be downloaded
from the repository.

What you end up with:

```
users  --HTTPS 443-->  caddy  -->  app (port 3000, localhost only)  -->  db (Postgres)
Splunk --TLS 5432 (Splunk IP only, read-only user) -------------------------^
```

## Before you start

You need:

- A Linux server (RHEL/Rocky/Alma or Ubuntu/Debian) with a **private IP**.
- A **hostname** that resolves to that server, for example `pgpkeygen.example.internal`.
- A **TLS certificate** for that hostname: the certificate, its private key, and the CA
  certificate that issued it.
- The **IP of the Splunk server** that runs DB Connect.
- Network access: users to the server on 80/443; Splunk to the server on 5432.

## Step 1. Set your values

Change the four values, then paste the block. Every later step uses them, so **keep this
terminal open**. If you open a new terminal, paste this block again.

```bash
export SERVER_IP=10.0.0.5                       # this server's private IP
export SPLUNK_IP=10.0.0.20                      # the Splunk server's IP
export DOMAIN=pgpkeygen.example.internal        # the hostname on your certificate
export IMAGE_TAG=1.1.0                          # pgpkeygen image version on ghcr.io
export APP_DIR=/opt/pgpkeygen
```

## Step 2. Install Docker

Skip this step if `docker compose version` already works.

RHEL / Rocky / Alma:

```bash
dnf -y install dnf-plugins-core
dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker
docker compose version
```

Ubuntu / Debian:

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker compose version
```

## Step 3. Create the folder

```bash
mkdir -p "$APP_DIR"/certs "$APP_DIR"/pg-certs "$APP_DIR"/incoming
cd "$APP_DIR"
```

## Step 4. Create the configuration files

Paste each block whole. The blocks write the files with placeholders such as
`__SERVER_IP__`; step 4e fills in your values from Step 1.

### 4a. `docker-compose.yml`

```bash
cat > docker-compose.yml <<'EOF'
services:
  app:
    image: ghcr.io/gunavault/pgpkeygen:__IMAGE_TAG__
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-pgpkeygen}:${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env (see .env.example)}@db:5432/${POSTGRES_DB:-pgpkeygen}
      # Generate one with: openssl rand -base64 32
      AUTH_SECRET: ${AUTH_SECRET:?Set AUTH_SECRET in .env (see .env.example)}
      # Trust X-Forwarded-For only when a sanitizing reverse proxy is the sole ingress.
      TRUST_PROXY_HEADERS: "true"
      # Bound per-user stored key count.
      MAX_KEYS_PER_USER: ${MAX_KEYS_PER_USER:-50}
      # Time zone for times shown in the app (IANA name). Stored times stay UTC.
      APP_TIME_ZONE: ${APP_TIME_ZONE:-Asia/Jakarta}
    networks:
      default:
        # Fixed so pg_hba.conf can allow the superuser from this one address only.
        ipv4_address: 172.30.0.10
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    command:
      - postgres
      - -c
      - hba_file=/etc/postgresql/pg_hba.conf
      - -c
      - ssl=on
      - -c
      - ssl_cert_file=/etc/postgresql/certs/server.crt
      - -c
      - ssl_key_file=/etc/postgresql/certs/server.key
    ports:
      # This server's PRIVATE IP only. Never use bare "5432:5432".
      - "__SERVER_IP__:5432:5432"
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-pgpkeygen}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env (see .env.example)}
      POSTGRES_DB: ${POSTGRES_DB:-pgpkeygen}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./pg_hba.conf:/etc/postgresql/pg_hba.conf:ro
      - ./pg-certs:/etc/postgresql/certs:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \"$${POSTGRES_USER}\" -d \"$${POSTGRES_DB}\""]
      interval: 5s
      timeout: 3s
      retries: 10

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./certs:/etc/caddy/certs:ro
      - caddy_data:/data
    depends_on:
      - app

networks:
  default:
    ipam:
      config:
        - subnet: 172.30.0.0/24
          # Automatic addresses (db, caddy) come only from .128-.255,
          # so nothing else can take the app's fixed 172.30.0.10.
          ip_range: 172.30.0.128/25

volumes:
  pgdata:
  caddy_data:
EOF
```

### 4b. `pg_hba.conf` (who may log in to the database, and from where)

```bash
cat > pg_hba.conf <<'EOF'
# Replaces the image's default, which ends with "host all all all scram-sha-256"
# and so admits every user, including the pgpkeygen superuser, from any address.
# __SPLUNK_IP__ is the Splunk server's IP. 172.30.0.10 is the app
# container's fixed IP from docker-compose.yml.
#
# This file is used from the very first start, including the image's one-time
# database setup, which connects over the local socket.

# TYPE   DATABASE   USER       ADDRESS           METHOD
local    all        all                          trust           # socket inside the container only (docker compose exec)
host     pgpkeygen  pgpkeygen  172.30.0.10/32    scram-sha-256   # app container only
hostssl  pgpkeygen  splunk_ro  __SPLUNK_IP__/32      scram-sha-256   # Splunk server only, TLS required
EOF
```

### 4c. `Caddyfile` (HTTPS)

```bash
cat > Caddyfile <<'EOF'
# __DOMAIN__ is the hostname on your certificate.
# fullchain.pem = your certificate followed by any intermediate certificates.
__DOMAIN__ {
	tls /etc/caddy/certs/fullchain.pem /etc/caddy/certs/privkey.pem

	# Enable once HTTPS is confirmed working for this hostname (see docs/browser-security.md).
	# header Strict-Transport-Security "max-age=31536000"

	# Caddy replaces any client-sent X-Forwarded-For with the real client IP,
	# which is what TRUST_PROXY_HEADERS=true relies on. Do not add
	# trusted_proxies here unless another proxy sits in front of Caddy.
	reverse_proxy app:3000
}
EOF
```

### 4d. `.env` (secrets)

This generates random secrets. It refuses to overwrite an existing `.env`, because the
database keeps the password from its **first** start; a new one later breaks the app's
database login.

```bash
if [ -e .env ]; then
  echo ".env already exists, keeping it"
else
  cat > .env <<EOF
AUTH_SECRET=$(openssl rand -base64 32)
POSTGRES_USER=pgpkeygen
POSTGRES_PASSWORD=$(openssl rand -hex 32)
POSTGRES_DB=pgpkeygen
MAX_KEYS_PER_USER=50
APP_TIME_ZONE=Asia/Jakarta
EOF
  chmod 600 .env
  echo ".env created"
fi
```

### 4e. Fill in your values

```bash
sed -i "s/__SERVER_IP__/$SERVER_IP/g; s/__IMAGE_TAG__/$IMAGE_TAG/g" docker-compose.yml
sed -i "s/__SPLUNK_IP__/$SPLUNK_IP/g" pg_hba.conf
sed -i "s/__DOMAIN__/$DOMAIN/g" Caddyfile
grep -n "__[A-Z_]*__" docker-compose.yml pg_hba.conf Caddyfile || echo "OK: all placeholders filled"
```

If `172.30.0.0/24` is already used on your network, change `subnet`, `ip_range` and the
app's `ipv4_address` in `docker-compose.yml`, and the app address in `pg_hba.conf`, to
another range.

## Step 5. Certificates

Copy your three files into `$APP_DIR/incoming/` (with `scp` or similar), named exactly
`server.crt` (your certificate), `server.key` (its private key) and `root-ca.crt` (the CA).

### 5a. Check them

```bash
cd "$APP_DIR"/incoming
head -1 server.crt server.key root-ca.crt                  # each must start with -----BEGIN
grep -c ENCRYPTED server.key                               # must print 0
openssl x509 -in server.crt -noout -pubkey | sha256sum
openssl pkey -in server.key -pubout | sha256sum            # must equal the line above
openssl x509 -in server.crt -noout -ext subjectAltName     # must list your DOMAIN
```

- A file that does not start with `-----BEGIN` is DER. Convert it:
  `openssl x509 -inform der -in server.crt -out server.crt`
- A key with a passphrase (`grep` printed 1 or more) cannot be used by a server. Remove the
  passphrase: `openssl pkey -in server.key -out server.key`

### 5b. Build the certificate chain

`root-ca.crt` may hold just the root CA, just an intermediate, or a bundle of both. This
block handles all three:

```bash
N=$(grep -c 'BEGIN CERTIFICATE' root-ca.crt)
SUBJ=$(openssl x509 -in root-ca.crt -noout -subject | sed 's/^subject=//')
ISS=$(openssl x509 -in root-ca.crt -noout -issuer | sed 's/^issuer=//')
if [ "$N" = 1 ] && [ "$SUBJ" = "$ISS" ]; then
  cp server.crt fullchain.pem                   # root-ca.crt is only the root
else
  cat server.crt root-ca.crt > fullchain.pem    # root-ca.crt includes intermediate(s)
fi
echo "certificates in fullchain.pem: $(grep -c 'BEGIN CERTIFICATE' fullchain.pem)"
openssl verify -CAfile root-ca.crt -untrusted fullchain.pem server.crt   # must print: OK
```

If `openssl verify` fails:

- `unable to get local issuer certificate`: your certificate was issued by an intermediate CA
  that is not in `root-ca.crt`. Get it from your CA, put it **first** in `root-ca.crt`
  (intermediate, then root), and run this step again.
- `unable to get issuer certificate`: `root-ca.crt` holds only the intermediate. Append the
  root CA to it (`cat root.crt >> root-ca.crt`) and run this step again.

### 5c. Put them in place

```bash
cd "$APP_DIR"
cp incoming/fullchain.pem certs/fullchain.pem
cp incoming/server.key    certs/privkey.pem
chmod 600 certs/privkey.pem

cp incoming/fullchain.pem pg-certs/server.crt
cp incoming/server.key    pg-certs/server.key
chown 70:70 pg-certs/server.crt pg-certs/server.key     # uid 70 = postgres in the image
chmod 600 pg-certs/server.key
chmod 644 pg-certs/server.crt
ls -l certs pg-certs
```

Expected: `certs/` holds `fullchain.pem` and `privkey.pem`; `pg-certs/` holds `server.crt`
and `server.key`, owned by `70`.

Keep `incoming/root-ca.crt`: the Splunk server needs it in Step 10.

## Step 6. Firewall

- 80 and 443: open to your users.
- 5432: open **only** to the Splunk IP, on the network firewall or security group.
- SSH: open only to administrators.

Docker publishes ports through its own firewall rules, which `ufw` and `firewalld` do not
filter. That is why 5432 is bound to the private IP only and restricted on the network
firewall. Avoid `firewall-cmd --reload` on this server; if you do run it, follow it with
`systemctl restart docker`.

## Step 7. Start

```bash
cd "$APP_DIR"
docker compose pull
docker compose up -d
sleep 20
docker compose ps
docker compose logs app | grep migrate
```

Expected:

- all three services `Up`, and `db` shows `(healthy)`
- `db` shows `<SERVER_IP>:5432->5432/tcp`, `caddy` shows `0.0.0.0:443->443/tcp`
- the log line `migrate: database is up to date`

If not, see [Troubleshooting](#troubleshooting).

## Step 8. Create the Splunk view and read-only user

### 8a. The view

Images that include migration `0006_soc_key_expiry` already create it on start. Running this
anyway is safe: it creates the view, or replaces it with the identical definition.

```bash
docker compose exec -T db psql -U pgpkeygen -d pgpkeygen <<'SQL'
-- Read-only projection of key expiry for SOC monitoring (Splunk DB Connect).
-- Exposes titles, expiry and ownership only. Never add private_key, public_key,
-- escrow_*, revocation_certificate or any users column other than email here:
-- splunk_ro can read every column of this view.
-- CREATE OR REPLACE so this applies cleanly where the view was created by hand
-- before the release that ships this migration.
CREATE OR REPLACE VIEW "soc_key_expiry" AS
SELECT
  k.id AS key_id,
  k.title,
  k.fingerprint,
  k.algorithm,
  u.email AS owner_email,
  k.created_at,
  k.expires_at,
  k.revoked_at,
  CASE
    WHEN k.revoked_at IS NOT NULL THEN 'revoked'
    WHEN k.expires_at IS NULL THEN 'never'
    WHEN k.expires_at <= now() THEN 'expired'
    WHEN k.expires_at <= now() + interval '30 days' THEN 'expiring'
    ELSE 'healthy'
  END AS expiry_status,
  (k.expires_at::date - current_date) AS days_remaining
FROM "pgp_keys" k
JOIN "users" u ON u.id = k.user_id;
SQL
```

### 8b. The read-only user `splunk_ro`

Safe to run again at any time: each run removes any extra access the user picked up.

```bash
docker compose exec -T db psql -U pgpkeygen -d pgpkeygen <<'SQL'
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
SQL
```

### 8c. Its password

Generate a password and **save it in your password manager first**:

```bash
openssl rand -base64 32
```

Then set it. You are asked to paste it twice:

```bash
docker compose exec db psql -U pgpkeygen -d postgres -c '\password splunk_ro'
```

A lost password cannot be recovered. Run this again with a new one and update Splunk.

## Step 9. Create the administrator

New accounts must be approved by an administrator before they can sign in, so the
first administrator is set up from the server:

1. Open `https://<DOMAIN>` in a browser and register an account. The login page says it is
   waiting for approval.
2. Promote and approve it, using the email you registered with:

   ```bash
   docker compose exec app node scripts/promote-admin.mjs you@example.com
   ```

3. Sign in. From now on, approve new users under **Users** in the admin area.

Times in the admin area are shown in `APP_TIME_ZONE` from `.env` (default
`Asia/Jakarta`, UTC+7).

## Step 10. Connect Splunk DB Connect

On the **Splunk server**:

1. Make `<DOMAIN>` resolve to the pgpkeygen server, if internal DNS does not already:
   `echo "<SERVER_IP> <DOMAIN>" >> /etc/hosts`
2. Copy `root-ca.crt` from the pgpkeygen server to, for example,
   `/opt/splunk/etc/auth/pgpkeygen-root-ca.pem`.

In **DB Connect**:

1. **Configuration > Databases > Identities > New Identity**: username `splunk_ro`, the
   password from Step 8c.
2. **Configuration > Databases > Connections > New Connection**:

   | Field | Value |
   |---|---|
   | Connection Type | PostgreSQL |
   | Identity | the identity from 1. **Required**: without it Splunk sends the OS user (often `root`) and is refused. |
   | Host | `<DOMAIN>` |
   | Port | `5432` |
   | Default Database | `pgpkeygen` |
   | JDBC URL (tick *Edit JDBC URL*) | `jdbc:postgresql://<DOMAIN>:5432/pgpkeygen?sslmode=verify-full&sslrootcert=/opt/splunk/etc/auth/pgpkeygen-root-ca.pem` |
   | Read Only | on |

3. **New Input**: batch mode, query `SELECT * FROM soc_key_expiry`, run once a day.

The view's columns and an example alert search are in [splunk-monitoring.md](splunk-monitoring.md).

## Step 11. Verify

Do not skip these. Each one checks a security property, not just that something works.

From the **Splunk server**:

```bash
CA=/opt/splunk/etc/auth/pgpkeygen-root-ca.pem
DOMAIN=pgpkeygen.example.internal        # your DOMAIN

# 1. The database superuser must be refused. Expect: no pg_hba.conf entry
psql "host=$DOMAIN user=pgpkeygen dbname=pgpkeygen sslmode=require" -c "select 1"

# 2. splunk_ro must not read key material. Expect: permission denied
psql "host=$DOMAIN user=splunk_ro dbname=pgpkeygen sslmode=verify-full sslrootcert=$CA" \
  -c "select private_key from pgp_keys limit 1"

# 3. splunk_ro can read the view. Expect: your keys (0 rows before any key exists)
psql "host=$DOMAIN user=splunk_ro dbname=pgpkeygen sslmode=verify-full sslrootcert=$CA" \
  -c "select title, expires_at, expiry_status from soc_key_expiry"
```

If check 1 asks for a password instead, **stop**: the superuser is reachable from the
network. Re-check `pg_hba.conf`.

From **any other machine** (replace the IP):

```bash
# 4. Port 5432 must not be reachable. Expect: BLOCKED
timeout 5 bash -c '</dev/tcp/10.0.0.5/5432' && echo OPEN || echo BLOCKED
```

On the **pgpkeygen server**, while check 3 runs or right after:

```bash
# 5. Postgres must see the real Splunk IP, not the Docker gateway 172.30.0.1
docker compose logs db --since 10m | grep -E "splunk_ro|$SPLUNK_IP" | tail -3
```

In a **browser**: `http://<DOMAIN>` must redirect to `https://` with a valid padlock. Once
that works, you may enable HSTS: uncomment the `Strict-Transport-Security` line in
`Caddyfile` and run `docker compose restart caddy`.

## Troubleshooting

Start with the logs:

```bash
cd "$APP_DIR"
docker compose ps
docker compose logs app --tail 30
docker compose logs db --tail 30
docker compose logs caddy --tail 30
```

| Symptom | Cause and fix |
|---|---|
| app: `password authentication failed for user "pgpkeygen"` | `.env` changed after the database was first created. Set the database password to match: `docker compose exec db psql -U pgpkeygen -d postgres -c '\password pgpkeygen'`, paste `POSTGRES_PASSWORD` from `.env`, then `docker compose restart app`. |
| caddy `Restarting`, log: `no such file or directory` | A certificate is missing or misnamed, or `Caddyfile` is a directory (Docker creates one if the file was missing at the first start). Check `ls -ld Caddyfile; ls -l certs/` and redo Step 4c or 5c. |
| caddy log: `permission denied` (RHEL with SELinux) | Add `,Z` to Caddy's two volume lines, for example `./Caddyfile:/etc/caddy/Caddyfile:ro,Z`, then `docker compose up -d caddy`. |
| db `Restarting` | Read `docker compose logs db`. Usually `pg-certs/server.key` ownership or permissions (Step 5c), or a typo in `pg_hba.conf`. |
| Browser: connection refused | caddy is not running (see above), DNS does not point to the server, or 443 is blocked. Test on the server: `curl -v --resolve $DOMAIN:443:127.0.0.1 https://$DOMAIN/ -o /dev/null` |
| Splunk: `no pg_hba.conf entry ... user "root"` | The DB Connect connection has no Identity (Step 10). |
| Splunk: `no pg_hba.conf entry ... host "x.x.x.x"` | Splunk connects from another IP than `SPLUNK_IP`. Add a `hostssl` line for it to `pg_hba.conf`, then apply it (next row). |
| Changed `pg_hba.conf`, nothing happened | `sed -i` and most editors write a new file that the running container does not see. Run `docker compose restart db`, then check: `docker compose exec db psql -U pgpkeygen -d postgres -c "select line_number, user_name, address, error from pg_hba_file_rules"` |
| Splunk: `The connection attempt failed` | Run `docker compose logs db --since 2m` right after a test. No new line: the connection never arrived (empty Host field in DB Connect, DNS, or firewall). A `FATAL` line says exactly what is wrong. |
| Website and 5432 both stopped answering | `firewalld` was reloaded. Run `systemctl restart docker`. |
| Splunk: `relation "soc_key_expiry" does not exist` or `permission denied for view` | Run Step 8a, then 8b. |

## Upgrading

Back up, switch the image tag, restart the app. It applies new database migrations on start.

```bash
cd "$APP_DIR"
docker compose exec db pg_dump -U pgpkeygen pgpkeygen > backup-$(date +%F).sql
NEW_TAG=1.2.0                                   # the version to deploy
sed -i "s#ghcr.io/gunavault/pgpkeygen:[^[:space:]]*#ghcr.io/gunavault/pgpkeygen:$NEW_TAG#" docker-compose.yml
docker compose pull app
docker compose up -d app
docker compose logs app | grep migrate
```

Never run `docker compose down -v`: `-v` deletes the database volume and every stored key.
