# Contributing

Thanks for helping improve PGPKeyGen.

This project is small, but it handles authentication and private key material, so
changes should optimize for understandable trust boundaries, least privilege, and
predictable failure behavior rather than cleverness.

## Development setup

Requirements:

- Node.js 22+
- pnpm 11.25.0 (the version pinned in `package.json`)
- Postgres 16, or Docker Compose for the bundled development database

Install the locked dependency set:

```sh
corepack enable
pnpm install --frozen-lockfile
```

Run the current local checks before opening a pull request:

```sh
pnpm lint
pnpm build
```

Issue #12 tracks the missing automated test/dependency-audit baseline. Until that
lands, do not treat a successful lint/build as sufficient evidence for a
security-sensitive behavior change. Add targeted regression coverage with the
change when test infrastructure is available.

## Pull requests

Keep pull requests focused. Explain:

- the user problem, bug, or security boundary being addressed;
- behavior before and after the change;
- security and privacy implications;
- compatibility or migration impact for self-hosted deployments;
- validation performed and tests added or updated;
- documentation changes needed for user-visible behavior.

Prefer one trust-boundary change per pull request. Avoid mixing authentication,
cryptographic behavior, schema migrations, deployment changes, and unrelated UI
cleanup simply because they were discovered at the same time.

For bug and security fixes, prefer a regression test that fails before the fix
and passes afterward.

## Security-sensitive changes

Take extra care when changing:

- `auth.ts`, login/registration flows, roles, sessions, or route authorization;
- `app/dashboard/actions.ts` or any server action accepting client-controlled key
  material or object identifiers;
- OpenPGP generation, parsing, fingerprinting, private-key handling, or revocation;
- `lib/db/`, Drizzle migrations, retention, or cascade/delete behavior;
- `lib/password.ts`, `lib/rate-limit.ts`, or reverse-proxy/client-IP assumptions;
- SMTP/passphrase behavior in `lib/mail.ts`;
- Docker, Compose, `DATABASE_URL`, reverse-proxy, or TLS-related configuration;
- dependencies involved in cryptography, authentication, mail, or the web runtime.

Security-sensitive behavior should fail closed. Do not silently weaken a control
because configuration is missing or malformed.

The browser is an untrusted client boundary. Recompute or validate authoritative
security metadata on the server rather than trusting values because the normal UI
produced them.

Never log, commit, or place in test fixtures:

- real private keys or passphrases;
- revocation certificates from real identities;
- account/session secrets;
- SMTP or database credentials;
- production audit data or user information.

Use synthetic identities and throwaway test keys.

## Database and deployment changes

Schema changes must include a committed Drizzle migration and document upgrade or
rollback implications where relevant.

Deployment changes must preserve safe defaults. Development convenience such as a
host-published database port should be explicit and should not quietly become the
production default.

When an environment-variable change affects existing installations, document how
existing deployments migrate rather than assuming recreating a container also
updates persisted database/application state.

## Dependencies

Keep dependency changes narrow and explain why a new package is required. Prefer
supported releases with active security maintenance. Update the lockfile
reproducibly and include security/compatibility notes for dependencies that sit on
critical trust boundaries.

## Documentation

User-facing instructions should describe current behavior exactly, especially
around authentication, key/passphrase handling, revocation, database exposure,
SMTP, and deployment failure modes.

Examples must use placeholders or synthetic data. Never commit real credentials,
private key material, private local paths, or production identifiers.

See `SECURITY.md` for vulnerability-reporting guidance.
