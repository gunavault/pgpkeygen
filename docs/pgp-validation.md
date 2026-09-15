# Server-side PGP validation

The browser generates keys, but browser-supplied metadata is not authoritative at the persistence boundary.

Before saving a key, the server:

1. enforces size limits on armored public/private payloads;
2. parses the public key with `openpgp.readKey()` and private key with `openpgp.readPrivateKey()`;
3. rejects private material that is already decrypted;
4. compares public/private fingerprints to prove both armors represent the same key pair;
5. verifies that the public key has a valid primary self-certified user;
6. derives the persisted fingerprint, primary name/email, algorithm description, and expiration from the parsed key.

The server action receives only title/notes plus the armored public and encrypted private key. Identity, algorithm, fingerprint, and expiration values displayed in the browser are convenience UI and are not accepted as database metadata.

Current payload limits are 128,000 characters for public armor and 512,000 characters for private armor. These are intentionally far above normal generated key sizes while bounding parser work and database payload abuse.
