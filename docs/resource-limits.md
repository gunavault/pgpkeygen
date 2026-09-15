# Resource limits

PGPKeyGen bounds stored key creation per account to reduce accidental or abusive database growth.

`MAX_KEYS_PER_USER` controls the maximum number of stored PGP key records for one user and defaults to `50`. Invalid, zero, or negative values fall back to the default rather than silently disabling the limit.

Key creation takes a PostgreSQL transaction-scoped advisory lock derived from the user ID, checks the user's current key count, and inserts only when the account remains below the configured limit. This serializes concurrent creation attempts for the same account so parallel requests cannot trivially race past the quota.

Deleting a key frees one slot. Operators can raise or lower the configured limit according to deployment capacity; lowering it does not delete existing data, but users at or above the new limit cannot create another key until their stored count falls below it.
