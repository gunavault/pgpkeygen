# Revocation certificate model

OpenPGP revocation certificates are security-sensitive capability material. They do not reveal the private signing key, but possession is sufficient to permanently revoke the corresponding public key.

## New keys

Newly generated revocation certificates are kept in the browser and are not persisted in Postgres. The generation flow requires the user to copy/store the certificate before the encrypted key record can be saved.

Revocation requires the user to provide the saved certificate. The server processes it only for that authenticated, user-scoped revocation operation and does not persist the supplied certificate.

## Legacy stored certificates

Older records may still contain a server-stored certificate from the previous design. Those records are marked in the dashboard so users can migrate safely instead of losing their only revocation capability during an automatic database migration.

For a legacy record, the authenticated owner can load the stored certificate, copy it to safe local storage, and then explicitly remove the server copy. The removal action is user-scoped. If a legacy stored certificate is used to revoke a key, the server clears that stored certificate in the same update that marks the key revoked.

Until a user exports/removes a legacy copy, a database compromise can still expose that legacy certificate. Operators should encourage migration of legacy records promptly. The application intentionally does not silently erase certificates that users were never previously given a chance to save.

## Threat model

A database containing only new-model records does not contain revocation certificates, so database compromise alone cannot obtain the capability needed to revoke those keys. The encrypted private key remains a separate confidentiality boundary protected by the user's passphrase.
