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
cp .env.example .env          # then set AUTH_SECRET (openssl rand -base64 32)
docker compose up --build -d
open http://localhost:3000
```

Environment variables the image reads:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. Compose points it at the bundled `db` service. |
| `AUTH_SECRET` | yes | Signs session cookies. Compose refuses to start without it. |
| `AUTH_TRUST_HOST` | set to `true` in the image | Lets Auth.js trust the `Host` header behind a reverse proxy. Set `AUTH_URL` to your public URL instead if you prefer an explicit origin. |
| `ADMIN_EMAILS` | no | Comma-separated emails that get the admin role when they register. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | no | Passphrase emails. Skipped when `SMTP_HOST` is empty. |

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
