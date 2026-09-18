# Key secret model

PGPKeyGen generates OpenPGP key pairs in the user's browser. The private key is encrypted before key material is sent to the application server.

## Strict mode remains the default

Passphrase recovery is optional per key and defaults to off. When recovery is not enabled, the private-key passphrase stays independent of the application database. The user must keep an external copy, and the key has no reveal action in the application.

The strict generation flow continues to require the user to acknowledge that the passphrase and revocation certificate have been saved before the encrypted key is persisted.

## Optional client-side recovery

A user may explicitly enable encrypted passphrase recovery for an individual key. Recovery encryption and decryption happen in the browser; the key-persistence server action receives only a bounded opaque recovery record, never the plaintext private-key passphrase.

The recovery design uses a random per-user vault key protected by a separate account-password-derived envelope. The vault key is kept only in browser memory and is not persisted in browser storage or transmitted to the server. Each opted-in key uses a fresh authenticated-encryption IV.

Per-key recovery ciphertext is authenticated with additional data that includes the authenticated user identity and PGP fingerprint. This binding prevents copying a recovery ciphertext to another key or user record and treating it as valid recovery material.

Reveal is shown only for keys that contain recovery ciphertext. It always asks for the account password again and performs the unlock locally. A wrong password fails authenticated decryption without returning partial plaintext.

See `docs/passphrase-recovery.md` for the envelope format, password-rotation rule, AAD rationale, and detailed threat model.

## Password changes

A signed-in user can rotate the account password without rewriting each escrowed PGP passphrase. The browser unwraps the existing vault envelope with the current password, re-wraps the same random vault key under the new password, then opens the candidate envelope again and verifies that the recovered bytes exactly match the original vault key.

When the account has escrowed PGP passphrases, the browser also opens one owner-scoped escrow sample with that verified key and its authoritative user-ID/fingerprint AAD before submitting the rotation. A failed unwrap, key comparison, or escrow check aborts before the credential update.

The server never performs vault cryptography. It verifies the current account password, validates the opaque candidate envelope, rejects reused envelope salt or IV values, and commits the new password hash, envelope, and `password.changed` audit event in one database transaction. Accounts with no vault envelope update only the password hash.

Changing the password does not currently invalidate already-issued JWT sessions. Session invalidation is a separate account-security capability rather than part of vault rotation.

## Forgotten-password reset cost

A forgotten-password reset is **not implemented** by this flow. The current vault key has only the account-password-wrapped envelope. Without the old password or a separately provisioned recovery envelope/code, an operator can replace the account credential but cannot recover or re-wrap that vault key.

That means an operator-assisted reset built on the current model would preserve the account and stored encrypted PGP keys but would orphan the existing escrowed passphrase recovery copies. The underlying PGP keys are not deleted; the recovery ciphertexts simply become unreadable because the old vault key can no longer be opened. A reset path that preserves recovery requires a second independently held recovery mechanism and must be designed separately.

## Security tradeoff

Recovery changes the compromise model. With recovery disabled, a database copy of an encrypted private key still requires the independently kept private-key passphrase. With recovery enabled, stored recovery material allows offline guessing against the account password.

For that reason the UI states the cost next to the opt-in control: enabling recovery makes account-password strength a single point of failure for that key's confidentiality. The strict no-recovery behavior remains available and remains the default.

Optional recovery does not claim to protect against a fully compromised application server or an XSS attacker active while the user unlocks recovery.

## Server trust boundary

`tests/passphrase-boundary.test.ts` remains the regression guard for the server boundary and is intentionally unchanged. Passphrase plaintext must not be accepted by `app/dashboard/actions.ts`, persisted in the database, logged, or sent through email.

Revocation certificates remain a separate security boundary. New revocation certificates stay client-held under the existing revocation model.
