# Optional passphrase recovery

Passphrase recovery is opt-in per key and defaults to off. The strict mode remains available: when recovery is not enabled, the private-key passphrase stays independent of the application database and the user must keep their own copy.

## Envelope design

Recovery uses two layers in the browser:

1. A random 256-bit vault key is created for the user.
2. A key derived from the account password with PBKDF2-HMAC-SHA-256 and a dedicated random salt protects that vault key with AES-256-GCM.
3. Each opted-in PGP passphrase is encrypted under the random vault key with a fresh AES-GCM IV.
4. The server stores only the wrapped vault-key envelope and opaque per-key ciphertext records.

The vault salt is separate from the authentication password-hash salt. The vault key is never transmitted and is kept only in browser memory. It is not stored in `localStorage`, `sessionStorage`, IndexedDB, cookies, or the database.

The envelope is initialized after a successful login, when the server has just verified the submitted credentials. If a reload removes the in-memory vault key, recovery for new keys remains locked until the user signs in again rather than creating a replacement envelope from an unverified password.

Because login initializes the envelope before any individual key necessarily opts into recovery, a database containing that envelope can be used as an offline verifier for guesses of the account password. With no per-key escrow records, however, cracking that account password still does not recover the independently kept PGP passphrases. Once a key opts into recovery, the same password also becomes the protection boundary for that key's escrowed passphrase.

## Authenticated record binding

Each per-key ciphertext uses AES-GCM additional authenticated data containing a domain separator, the authenticated user ID, and the PGP key fingerprint.

This is a security boundary, not decorative metadata. It prevents a stored recovery ciphertext from being transplanted onto another key row or another user's row and then being accepted as valid recovery material. Reveal uses the user ID and fingerprint from the authenticated owner-scoped lookup.

## Reveal behavior

Only keys with an escrow record show a reveal action. Reveal always re-prompts for the account password, even when a vault key may already exist in session memory for wrapping newly generated keys.

The application fetches the opaque envelope/ciphertext before opening a network-blind local prompt. The prompt component has no server-action import: it uses the freshly entered account password only to unwrap the envelope and decrypt the passphrase locally. Wrong passwords fail authenticated decryption and return no partial plaintext. Temporary unwrapped vault-key bytes are zeroed after the attempt.

## Password rotation

The account password protects the single vault-key envelope rather than every per-key ciphertext directly. A password-change flow must unwrap the existing random vault key and re-wrap that same key under the new password. It must not replace the random vault key, because that would orphan all existing escrowed passphrases.

This makes password rotation a single-envelope operation and also leaves a clean upgrade path for stronger future key sources such as WebAuthn PRF.

## Threat model

Recovery changes the compromise model deliberately:

| Threat | No key has opted into recovery | A key has opted into recovery |
| --- | --- | --- |
| Database dump / backup / SQL injection | The login-created envelope permits offline guessing of the account password, but the PGP passphrase remains independently held | Offline account-password guessing can also unlock the escrowed PGP passphrase |
| Compromised application server | Normal stored key data does not contain the PGP passphrase | Not protected: the credentials provider already receives the raw account password during login |
| XSS active during unlock/reveal | No per-key application recovery plaintext exists | Can expose plaintext or in-memory recovery material at the moment it is used |
| Old plaintext-email design | Not used | Better: plaintext never lands in SMTP or an inbox |

**User-facing cost:** enabling recovery makes account-password strength the single point of failure for the confidentiality of that key's passphrase. A stolen database does not immediately reveal plaintext, but it gives an attacker material for offline password guessing.

That tradeoff is why the checkbox defaults off and the warning is shown next to the choice rather than buried only in documentation.

## Server boundary

`tests/passphrase-boundary.test.ts` remains unchanged. `app/dashboard/actions.ts` accepts only a bounded opaque escrow DTO and never receives the plaintext private-key passphrase. Server-side storage validates format versions and sizes before persistence.

Revocation certificates remain client-held for new keys and are outside this feature's passphrase-recovery scope.
