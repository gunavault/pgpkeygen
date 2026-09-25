# Deployment runbook

How to deploy pgpkeygen to a self-hosted server, and the specific failures to expect
along the way. Every problem listed under "Known failure modes" was hit during a real
deployment to a RHEL VM on Google Cloud; the fixes are the ones that actually worked.

Read [Three things that will bite you](#three-things-that-will-bite-you) before
starting. Each one fails in a way that does not obviously point at its cause.

---

## Prerequisites

| Requirement | Notes |
| --- | --- |
| Docker with Compose v2 | `docker compose version` |
| A hostname | Not an IP. TLS certificates are issued for names. |
| A TLS certificate | Public CA or internal PKI. See [TLS](#tls-termination). |
| Outbound network at build time | Only if building on the server. See [Build](#choosing-a-build-strategy). |

The running application needs no outbound internet access at all. It talks to Postgres
over the private Compose network and nothing else. Outbound access is a **build-time**
requirement only.

---

## Three things that will bite you

### 1. HTTPS is mandatory, not a hardening step

All browser-side cryptography runs on `crypto.subtle`, which browsers expose **only in a
secure context**: HTTPS, `localhost`, or `file://`. Over `http://<server-ip>:3000` it is
`undefined`.

Consequence: **passphrase recovery cannot work over plain HTTP.** Key generation may
appear to work, which makes this easy to miss until a user enables recovery.

Do not run a production import over plain HTTP. Keys would be stored with no recovery
copy, and nothing announces it beyond a disabled checkbox.

For a quick check or a one-off migration before TLS is ready, an SSH tunnel is a valid
workaround because `localhost` is a secure context:

```bash
ssh -L 3000:localhost:3000 user@server
# then browse http://localhost:3000 on your own machine
```

### 2. Container DNS may differ from host DNS

Image pulls go through the Docker daemon and use the host resolver. Build containers
resolve separately. On cloud VMs the host resolver is often a link-local address
(`169.254.169.254` on GCP, `169.254.169.253` on AWS) which containers **cannot reach**.

Symptom: `docker pull` succeeds, `pnpm install` inside the build fails with
`EAI_AGAIN registry.npmjs.org`.

### 3. The build fetches a font from Google

`app/layout.tsx` uses `next/font/google`, which downloads Archivo during `next build`
and self-hosts it in the image. The build therefore requires reachability to
`fonts.googleapis.com`.

Runtime is unaffected — the font ships inside the image — but a locked-down build
environment will fail here with a `403` or a timeout.

---

## Choosing a build strategy

| | Build on the server | Build elsewhere, pull an image |
| --- | --- | --- |
| Build-time internet needed on server | Yes | No |
| Update procedure | `git pull && docker compose up --build -d` | Build, push, bump tag, `pull` |
| Production has a toolchain | Yes | No |
| Rollback | Rebuild an older commit | Change one image tag |

Build on the server when it has normal outbound access — it is the simplest operational
story. Use a registry when the server's egress is restricted, or when you want immutable
versioned artifacts and no build toolchain in production.

### Path A — build on the server

```bash
git clone https://github.com/gunavault/pgpkeygen.git
cd pgpkeygen
git checkout v1.1.0          # always deploy a tag, never a moving branch
cp .env.example .env
# fill in AUTH_SECRET and POSTGRES_PASSWORD — see Environment
docker compose up --build -d
```

### Path B — build elsewhere, pull from a registry

Use `ghcr.io` rather than Docker Hub: same credentials as GitHub, visibility follows the
repository, and no pull rate limits.

On a machine with working egress:

```bash
git fetch --tags
git checkout v1.1.0
docker build -t pgpkeygen .

# classic PAT with write:packages — fine-grained tokens commonly fail here
echo "$CR_PAT" | docker login ghcr.io -u <github-user> --password-stdin

docker tag pgpkeygen ghcr.io/<github-user>/pgpkeygen:1.1.0
docker push ghcr.io/<github-user>/pgpkeygen:1.1.0
```

The image tag and the git tag must name the same version. Build from the git tag, not
from a working tree, so the image provably contains that commit.

Newly pushed ghcr packages are **private by default even when the repository is public**.
Either make the package public, or `docker login ghcr.io` on the server with a
`read:packages` token.

On the server, replace the `build:` block with `image:`:

```yaml
services:
  app:
    image: ghcr.io/<github-user>/pgpkeygen:1.1.0
```

```bash
docker compose pull
docker compose up -d
```

Pin an exact version. Never deploy `latest` — you want to know what is running and to
roll back by editing one line.

---

## Environment

Copy `.env.example` to `.env`. Compose reads it automatically.

| Variable | Required | Notes |
| --- | --- | --- |
| `AUTH_SECRET` | Yes | `openssl rand -base64 32`. Signs session cookies. |
| `POSTGRES_PASSWORD` | Yes | `openssl rand -hex 32`. Keep it URL-safe. |
| `POSTGRES_USER` | No | Defaults to `pgpkeygen`. |
| `POSTGRES_DB` | No | Defaults to `pgpkeygen`. |
| `TRUST_PROXY_HEADERS` | No | `false` by default. See the warning below. |
| `MAX_KEYS_PER_USER` | No | Defaults to `50`. Raise it before a bulk import. |

> **`TRUST_PROXY_HEADERS` and loopback binding go together.**
> Set `TRUST_PROXY_HEADERS=true` **only** when the app port is bound to `127.0.0.1` and a
> reverse proxy is the sole ingress. Trusting `X-Forwarded-For` while port 3000 remains
> directly reachable lets an attacker forge a source address and bypass per-IP rate
> limiting on sign-in and password change.

Rotating `AUTH_SECRET` invalidates every existing session. That is a valid way to force
everyone to sign in again.

---

## TLS termination

TLS terminates at one place: a reverse proxy in front of the app. The application itself
speaks plain HTTP on the private Compose network and never needs a certificate.

```
browser --HTTPS:443--> proxy --HTTP:3000--> app --> postgres
```

Prefer whatever your infrastructure team already operates. If they run nginx or httpd,
use that; introducing a new component to a host someone else maintains has a cost.
Caddy is a good default only when there is no existing preference.

### Preparing a certificate you were issued

You will typically receive a certificate, a private key, and sometimes a CSR. **The CSR
is not needed** — it was consumed when the certificate was issued.

Verify three things before configuring anything:

```bash
# 1. Is the chain complete? "1" means you are missing intermediates.
grep -c "BEGIN CERTIFICATE" certificate.crt

# 2. Do the key and certificate match? The two hashes must be identical.
openssl x509 -noout -modulus -in certificate.crt | openssl md5
openssl rsa  -noout -modulus -in private.key     | openssl md5

# 3. Which hostname, and when does it expire?
openssl x509 -in certificate.crt -noout -subject -ext subjectAltName -dates
```

A missing intermediate is the most common cause of "works in one browser, fails in
another". If step 1 returns `1`, ask for the CA bundle and concatenate leaf first:

```bash
cat certificate.crt intermediate.crt > fullchain.pem
```

If you were given a `.pfx` or `.p12`:

```bash
openssl pkcs12 -in cert.pfx -clcerts -nokeys -out certificate.crt
openssl pkcs12 -in cert.pfx -nocerts  -nodes -out private.key
```

### Option 1 — nginx on the host

```nginx
server {
    listen 80;
    server_name pgp.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name pgp.example.com;

    ssl_certificate     /etc/pki/tls/certs/fullchain.pem;
    ssl_certificate_key /etc/pki/tls/private/server.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
nginx -t && systemctl reload nginx
```

On RHEL with SELinux enforcing, nginx cannot proxy until:

```bash
setsebool -P httpd_can_network_connect 1
```

### Option 2 — Caddy as a container

`Caddyfile`:

```
pgp.example.com {
    tls /etc/caddy/certs/fullchain.pem /etc/caddy/certs/server.key
    reverse_proxy app:3000
}
```

Add to `docker-compose.yml`:

```yaml
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

volumes:
  pgdata:
  caddy_data:
```

Certificates are mounted at runtime, never baked into an image. A private key inside an
image would be published to the registry along with it.

### Either option — lock the app to loopback

```yaml
  app:
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      TRUST_PROXY_HEADERS: "true"
```

---

## First run

```bash
docker compose up -d
docker compose ps          # app, db and the proxy should all be Up
docker compose logs -f app
```

Migrations apply automatically at container start — the entrypoint is
`node scripts/migrate.mjs && exec node server.js`. Watching them apply is the signal that
the database connection is healthy.

Register your account through the web interface, then promote it:

```bash
docker compose exec app node scripts/promote-admin.mjs you@example.com
```

The command fails unless exactly one account matches the normalized email. There is no
self-service path to admin, by design.

---

## Verification checklist

Run all four. The last one is the only proof that recovery will work.

```bash
# 1. Certificate chain resolves
openssl s_client -connect pgp.example.com:443 -servername pgp.example.com </dev/null 2>/dev/null \
  | grep 'Verify return code'
# want: Verify return code: 0 (ok)

# 2. Port 3000 is NOT reachable from outside
curl -m 5 http://<server-ip>:3000/login    # want: connection refused

# 3. Migrations applied
docker compose exec db psql -U pgpkeygen -d pgpkeygen -c '\dt'
# want: audit_log, pgp_keys, users
```

4. In the browser at `https://pgp.example.com`, open the console and run:

```js
window.isSecureContext && !!crypto.subtle
```

Must print `true`. If it prints `false` or throws, passphrase recovery will not work and
the deployment is not ready for real keys.

---

## Upgrades

```bash
# Path A
git fetch --tags && git checkout v1.2.0
docker compose up --build -d

# Path B
# build and push v1.2.0 elsewhere, then on the server:
sed -i 's|pgpkeygen:1.1.0|pgpkeygen:1.2.0|' docker-compose.yml
docker compose pull && docker compose up -d
```

Migrations are applied by the new container on start. Take a database dump first —
migrations are not automatically reversible.

---

## Backup and restore

The `pgdata` volume holds the entire vault. Losing it loses every escrowed passphrase,
and no copy exists anywhere else.

```bash
# backup
docker compose exec -T db pg_dump -U pgpkeygen pgpkeygen > backup-$(date +%F).sql

# restore into an empty database
docker compose exec -T db psql -U pgpkeygen -d pgpkeygen < backup-2026-09-25.sql
```

Take a dump before any upgrade, and before and after a bulk import.

Note what a backup does **not** protect against: a forgotten account password. Escrowed
passphrases are encrypted under a key derived from it, so a database backup cannot
recover them. See `docs/key-secret-model.md`.

---

## Known failure modes

Each of these was encountered during a real deployment.

### `EAI_AGAIN registry.npmjs.org` during `pnpm install`

Container DNS cannot reach the host's resolver. Confirm:

```bash
docker run --rm alpine nslookup registry.npmjs.org     # times out
docker run --rm alpine cat /etc/resolv.conf            # shows a 169.254.x.x address
```

Fix, in order of preference:

1. Build using the host network stack, which uses the host's working resolver:
   ```yaml
   services:
     app:
       build:
         context: .
         network: host
   ```
2. Give the daemon reachable resolvers in `/etc/docker/daemon.json`, then
   `systemctl restart docker`:
   ```json
   { "dns": ["8.8.8.8", "1.1.1.1"] }
   ```
   This only works if the VM can route to public DNS.

A proxy does not fix this. The failure is routing, not egress policy — `docker pull`
succeeding proves the host has internet.

### `403` from `fonts.googleapis.com` during `pnpm build`

The build cannot fetch Archivo. Either build on a machine that can reach Google Fonts and
deploy the resulting image, or vendor the font into the repository and switch
`app/layout.tsx` from `next/font/google` to `next/font/local`.

Vendoring is the better long-term fix for a self-hosted product: it makes builds
reproducible and possible on an air-gapped network.

### `denied: denied` when pushing to ghcr.io

The token lacks package scope. `docker login` can succeed with a token that still cannot
push. Use a **classic** PAT with `write:packages`; fine-grained tokens commonly fail here.

```bash
docker logout ghcr.io
echo "$CR_PAT" | docker login ghcr.io -u <github-user> --password-stdin
```

Image paths must be lowercase.

### `SecretsUsedInArgOrEnv: ENV "AUTH_TRUST_HOST"` during build

A false positive. `AUTH_TRUST_HOST=true` is a boolean telling Auth.js to trust the
forwarded host, not a credential. Real secrets are injected at runtime and are not in the
image. No action needed.

### Recovery checkbox is disabled in the UI

Two possible causes:

1. **Not served over HTTPS.** `crypto.subtle` is unavailable. See
   [Three things](#three-things-that-will-bite-you).
2. **The page was hard-reloaded.** The vault key lives in browser memory only and is
   dropped by a refresh, a new tab, or a typed URL. Sign out and sign back in.

The second is expected behaviour and the UI explains it. During a bulk import, sign in
once and navigate using in-app links rather than the address bar.

### `Private key material must be encrypted before persistence`

An unprotected private key was submitted. The vault refuses to store private key material
that carries no passphrase. Encrypt the key before importing it.

### Imports fail with "Your key limit has been reached"

`MAX_KEYS_PER_USER` defaults to 50. Raise it in `.env` and recreate the app container.

---

## Related documents

- `docs/key-secret-model.md` — what the server can and cannot see
- `docs/passphrase-recovery.md` — the envelope design
- `docs/browser-security.md` — response headers, CSP, HSTS placement
- `docs/rate-limiting.md` — limiter scope and its single-instance constraint
