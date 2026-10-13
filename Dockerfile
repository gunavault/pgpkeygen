# ---- base: Node + the pnpm version pinned in package.json ----
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

# ---- deps: install with the lockfile only, so this layer caches well ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The supply-chain check alone downloads ~230 MB of registry metadata (next's
# is 25 MB), which a slow or proxied link cannot fetch within pnpm's 60 s
# per-request default. Allow 10 minutes and more retries, and keep pnpm's
# cache and store in a BuildKit cache mount: a failed build resumes where it
# stopped, and later builds skip the check once this lockfile has passed it.
# pnpm 11 reads pnpm_config_*, not npm_config_*.
ENV pnpm_config_store_dir=/pnpm/store \
    pnpm_config_cache_dir=/pnpm/cache \
    pnpm_config_fetch_timeout=600000 \
    pnpm_config_fetch_retries=5
RUN --mount=type=cache,id=pnpm,target=/pnpm pnpm install --frozen-lockfile

# ---- build: compile the standalone Next.js server ----
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- runner: only the traced output, running as a non-root user ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    # Auth.js refuses requests in production unless the host is trusted or
    # AUTH_URL is set. Self-hosted deployments sit behind a reverse proxy, so
    # trust the forwarded host; override with AUTH_URL if you prefer.
    AUTH_TRUST_HOST=true

RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build --chown=app:app /app/scripts/promote-admin.mjs ./scripts/promote-admin.mjs

USER app
EXPOSE 3000

# Apply pending migrations, then start the server.
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node server.js"]
