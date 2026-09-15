# Key secret model

PGPKeyGen generates OpenPGP key pairs in the user's browser. The private key is encrypted with the user's passphrase before any key material is sent to the application server.

## Passphrases are local-only

The private-key passphrase is never accepted by a server action, persisted in the database, logged, or sent through SMTP. There is no passphrase recovery service.

The generation flow intentionally separates generation from persistence:

1. the browser generates the key pair and revocation certificate;
2. the UI displays the passphrase and asks the user to copy/store it;
3. the user must explicitly confirm that the passphrase is safely stored;
4. only then does the browser send the encrypted private key, public key, revocation material, and non-secret metadata to the server.

If the user navigates away before step 4, no vault record has been created. This prevents the application from persisting a key that the user has not acknowledged being able to decrypt.

## Server trust boundary

A compromised application server or SMTP service should not gain the passphrase from normal application traffic. A database compromise can expose the encrypted armored private key and other stored metadata, but recovering the private key still requires the user's independently stored passphrase.

Revocation-certificate storage is a separate security boundary tracked independently because possession of a revocation certificate can permanently revoke the corresponding key even without the private-key passphrase.
