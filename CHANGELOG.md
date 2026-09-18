# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-18

First stable release. A self-hosted, multi-user PGP key manager in which the
server never sees a passphrase or a plaintext private key.

### Trust model

The defining property of this release is where secrets live. Key pairs are
generated in the browser with openpgp.js. The passphrase never leaves the
browser in plaintext, and the server stores only material it cannot open.

- Key generation runs entirely client-side; the private key is encrypted under
  the user's passphrase before it is sent anywhere.
- Optional passphrase recovery uses two-layer envelope encryption: a random
  256-bit vault key wrapped under a key derived from the account password
  (PBKDF2-SHA-256, 600,000 iterations), and per-key passphrases encrypted under
  that vault key with AES-GCM.
- Escrow ciphertext is bound to its owner and key with additional authenticated
  data, so a record cannot be transplanted between users or between keys.
- Revocation certificates are generated and held client-side. Legacy
  server-stored certificates can be exported and then erased from the server.

### Features

- Email and password accounts with role-based access (user, admin).
- Browser-side PGP key generation with selectable algorithm and expiration.
- Key inventory with title, identity, fingerprint, algorithm, and status.
- Key revocation using a client-held revocation certificate.
- Optional encrypted passphrase recovery, off by default and per key.
- Legacy revocation certificate export and server-side erasure.
- Admin dashboard with a user list and an audit log view.
- Audit trail covering registration, sign-in success and failure, key
  generation, revocation and deletion, recovery enablement, recovery material
  access, and legacy certificate export and erasure.
- Docker Compose deployment with migrations applied on container start and an
  admin promotion script.

### Hardening

- Fixed-window rate limiting on sign-in and registration, per account, per
  source, and globally, with a bounded key store that fails closed.
- Per-user key quotas enforced under a per-user advisory lock, so concurrent
  requests cannot race past the limit.
- Security response headers including a content security policy.
- Server-side validation of submitted key material, including verification of
  the primary self-certification.
- CRLF injection fix in email header handling.
- Dependency audit in CI.

### Known limitations

- **No account password change.** Password rotation is not available in this
  release. Because the account password derives the key that wraps the vault,
  rotating it requires proving vault continuity in the browser first. Tracked
  in #36, implemented in #42, landing after 1.0.0.
- **No session invalidation.** Sessions are JWT-based with no server-side
  session store, so an issued token cannot be revoked before it expires, and
  roles change only at next sign-in. Tracked in #40.
- **No password reset.** A forgotten password cannot be recovered. Because the
  password wraps the vault key, any reset path either loses every escrowed
  passphrase or requires a second recovery envelope. This is an open product
  decision, tracked in #36.
- **No key export or import.** Tracked in #37.
- **No expiry lifecycle.** Expiring keys are not surfaced or acted on.
  Tracked in #38.
- Rate limiting is process-local. Multi-replica deployments need a shared
  limiter before scaling horizontally.

[1.0.0]: https://github.com/gunavault/pgpkeygen/releases/tag/v1.0.0
