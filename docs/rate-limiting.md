# Authentication rate limiting

PGPKeyGen applies process-local fixed-window throttles to authentication and registration. The limiter is intentionally bounded to 5,000 active keys and fails closed for new keys if capacity is exhausted before expired entries can be reclaimed.

## Login limits

Login requests are checked against three independent limits over a 15-minute window:

- account: 5 attempts per normalized email;
- trusted source: 30 attempts per resolved client IP when proxy trust is enabled;
- process-wide: 500 attempts.

The account and global limits remain active when no trustworthy client IP is available, so clients cannot bypass throttling by inventing forwarding headers.

## Registration limits

Registration uses a 1-hour window with:

- trusted source: 10 attempts per resolved client IP when available;
- process-wide: 100 attempts.

## Reverse proxy trust

`TRUST_PROXY_HEADERS=false` is the safe default. In that mode, `X-Forwarded-For` is ignored completely.

Set `TRUST_PROXY_HEADERS=true` only when a trusted reverse proxy is the sole ingress path to the application and that proxy replaces/sanitizes `X-Forwarded-For`. Do not enable it while port 3000 is directly reachable by untrusted clients, because direct clients can supply forwarding headers themselves.

## Deployment topology

The built-in limiter is deliberately single-process. Do not scale the application to multiple replicas and assume these counters are shared. Multi-replica deployments must place an equivalent shared limiter at the trusted ingress or replace the process-local store with a shared bounded store such as Redis before scaling horizontally.

Password hashing and verification use asynchronous `crypto.scrypt`, so KDF work does not synchronously block the Node event loop.
