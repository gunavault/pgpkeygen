# Forgotten-password reset

A user who forgets their account password gets back in through an administrator. What they
keep depends on whether they made a **recovery code** beforehand.

| | Reset with recovery code | Forced reset |
| --- | --- | --- |
| Needs | Admin-issued reset token + the user's recovery code | Admin-issued reset token |
| PGP keys | Kept | Kept |
| Stored passphrase copies (escrow) | Kept | **Removed** |
| Admin can read secrets | No | No |

## Two secrets, two holders

- The **recovery code** (128 bits, Crockford base32) is generated in the browser and shown to
  the user once. The browser wraps the existing random vault key under it, in the same
  envelope format and KDF as the password envelope (`lib/recovery-code.ts`,
  `wrapVaultKey` in `lib/vault-escrow.ts`). The server stores that second envelope and
  `SHA-256(verifier)`, where `verifier = SHA-256("pgpkeygen:recovery-verifier:v1\0" + code)`.
  It never receives the code.
- The **reset token** (also 128 bits) is created when an administrator clicks **Allow reset**,
  shown to them once, and handed to the user out of band. The server stores only its
  SHA-256. It is valid for 60 minutes, for one use, and for at most 5 wrong attempts
  (`lib/password-reset.ts`).

The administrator never sees the recovery code, so they cannot open the vault. Someone with
only the recovery code cannot start a reset without a token. The token alone cannot open the
vault either.

## Reset with recovery code

1. An administrator chooses **Allow reset → With recovery code** for an active account that has
   a recovery code.
2. The user opens **Forgot password?**, then enters their email and the token. The server
   returns the recovery envelope.
3. The browser opens the vault key with the recovery code. It wraps that key under the new
   password and under a newly generated recovery code, and checks that both new envelopes
   open to the same key.
4. The server checks the token and the verifier. In one transaction it writes the password
   hash and both envelopes, deletes the reset, and moves the session cutoff. It records
   `password.reset` in the audit log. If the audit write fails, everything rolls back.

Escrow ciphertexts are untouched. Their AAD binds them to the user ID and key fingerprint,
neither of which changes. The old recovery code stops working, because a reset always
issues a new one.

## Forced reset

For a user without a recovery code, or one who lost it. The server replaces the password
hash, clears the vault envelope, the recovery code and every `escrow_*` column of the user's
keys, and moves the session cutoff, all in one transaction. It records `password.reset_forced`
in the audit log, with the number of copies removed. The next sign-in creates a fresh vault.
The PGP keys stay usable for anyone who still knows each key's passphrase.

## Failure handling

- A wrong token or wrong recovery code returns one generic message. It increments the
  attempt count, which is committed even though the reset fails, and is audited as
  `password.reset_failed`. The fifth failure deletes the reset.
- Requests are also rate-limited per email and per source IP.
- A reset only works for the kind the administrator chose: a recovery token cannot trigger a
  forced reset.
- Only active administrators can issue resets, never for themselves, and only for active
  accounts.

## Tests

- `tests/recovery-code.test.ts`: real WebCrypto.
- `tests/password-reset.test.ts` and `tests/recovery-code-provision.test.ts`: transactional
  harnesses.
- `tests/password-recovery-migration.test.ts`: live PostgreSQL; checks the all-or-nothing
  recovery columns and one reset per account.
