# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue containing exploit details, private keys,
private-key passphrases, revocation certificates, account credentials, session
secrets, SMTP credentials, database credentials, or private user data.

Use GitHub's **Security** tab and **Report a vulnerability** when private
vulnerability reporting is available for this repository.

If private vulnerability reporting is not available, open a minimal public issue
asking the maintainers for a private reporting channel. Include only enough
information to identify the affected component. Do not include a working exploit,
secret material, or user data in the public issue.

A useful private report includes:

- the affected commit or deployment version;
- the impacted component or trust boundary;
- a concise description of the security impact;
- minimal reproduction steps that use synthetic data;
- whether authentication, authorization, PGP material, SMTP, database access, or
  deployment configuration is involved;
- a suggested mitigation, if known.

## Sensitive data

This application manages OpenPGP key material. Treat the following as sensitive
when testing, debugging, reviewing, or reporting issues:

- private keys, even when passphrase-encrypted;
- private-key passphrases;
- revocation certificates;
- authentication cookies, session tokens, passwords, and password hashes;
- SMTP and database credentials;
- audit-log data and user email addresses.

Use synthetic accounts and throwaway test keys. Never commit real secret material
or production data. Do not add secrets to screenshots, logs, fixtures, issue
comments, pull-request descriptions, or CI output.

If a secret may have been exposed, rotate or revoke it as appropriate rather than
assuming deletion from Git history or an issue comment is sufficient.

## Security-sensitive areas

Changes in these areas deserve extra review and regression coverage:

- authentication, registration, session handling, and admin-role assignment;
- PGP generation, parsing, validation, storage, export, and revocation;
- server actions that accept client-controlled key material or identifiers;
- database schema, migrations, backups, and deletion semantics;
- passphrase handling and SMTP delivery;
- rate limiting and reverse-proxy/client-IP handling;
- Docker, Compose, database exposure, TLS, and reverse-proxy configuration;
- browser security headers and rendering of private key material;
- dependency upgrades that affect cryptography, authentication, mail, or the web
  runtime.

Security-sensitive behavior should fail closed. Avoid silently falling back to a
less restrictive configuration when validation or security controls fail.

## Supported versions

Until the project publishes versioned releases, security fixes are applied to the
latest commit on the default branch.
