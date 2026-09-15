This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Deploying with Docker

The repo ships a multi-stage `Dockerfile` that builds a self-contained Next.js
server (`output: "standalone"`) and a `docker-compose.yml` that runs it next to
Postgres 16. On start the container applies any pending migrations from
`drizzle/` and then serves on port 3000.

```bash
cp .env.example .env
openssl rand -base64 32   # set this as AUTH_SECRET in .env
openssl rand -hex 32      # set this as POSTGRES_PASSWORD in .env
docker compose up --build -d
open http://localhost:3000
```

The default Compose deployment does **not** publish Postgres to the host. The app
reaches it over the private Compose network, so port 5432 is not exposed to the
LAN or internet by default.

Environment variables the image reads:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. Compose builds this from the `POSTGRES_*` settings below and points it at the bundled `db` service. |
| `AUTH_SECRET` | yes | Signs session cookies. Compose refuses to start without it. |
| `POSTGRES_USER` | with Compose | Database user. Defaults to `pgpkeygen`. |
| `POSTGRES_PASSWORD` | with Compose | Database password. Compose refuses to start without it. Use a strong URL-safe value such as `openssl rand -hex 32`. |
| `POSTGRES_DB` | with Compose | Database name. Defaults to `pgpkeygen`. |
| `AUTH_TRUST_HOST` | set to `true` in the image | Lets Auth.js trust the `Host` header behind a reverse proxy. Set `AUTH_URL` to your public URL instead if you prefer an explicit origin. |
| `ADMIN_EMAILS` | no | Comma-separated emails that get the admin role when they register. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | no | Passphrase emails. Skipped when `SMTP_HOST` is empty. |

For local development that needs Postgres reachable from the host, opt in to the
development override. It binds only to loopback:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
```

The database is then reachable at `127.0.0.1:5433`. Use the same values from
`.env` when constructing your local `DATABASE_URL`, for example:

```text
postgres://pgpkeygen:<POSTGRES_PASSWORD>@127.0.0.1:5433/pgpkeygen
```

Do not add a public database port mapping to the production Compose file. If the
database must be operated separately, restrict it at the network/firewall layer
and use deployment-specific credentials.

To deploy elsewhere without Compose, build and run the image against any
Postgres:

```bash
docker build -t pgpkeygen .
docker run -d -p 3000:3000 \
  -e DATABASE_URL=postgres://user:pass@host:5432/pgpkeygen \
  -e AUTH_SECRET=... \
  pgpkeygen
```

Migrations run on every start via `scripts/migrate.mjs` and are idempotent
(they share the `drizzle.__drizzle_migrations` table with `pnpm db:migrate`).
If you run several replicas, start one first so the migration is applied once
before the others come up.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
