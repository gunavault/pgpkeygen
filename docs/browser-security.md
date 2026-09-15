# Browser security policy

PGPKeyGen renders encrypted private-key material in authenticated pages, so browser-side injection and framing protections are part of the key-management boundary.

## Application headers

Next.js applies the following headers to every application path through the catch-all `/:path*` rule in `next.config.ts`:

- `Content-Security-Policy`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- a restrictive `Permissions-Policy`

The CSP restricts content to the same origin by default, disables objects and media, prevents framing, restricts forms/base URLs to the same origin, and permits only same-origin/inline application scripts and styles plus the data/blob sources needed by normal Next.js/OpenPGP browser behavior.

### Why `unsafe-inline` remains

This is a static CSP applied from `next.config.ts`. Next.js hydration emits inline bootstrap scripts, and the current application also relies on inline style behavior. A strict nonce policy would require a fresh nonce per request and proxy-driven dynamic rendering. Next.js documents that model separately.

Production does **not** include `unsafe-eval`. Development includes it because React/Next development tooling requires evaluation for debugging. Moving from the static policy to nonce/SRI enforcement should be treated as a separate rendering/performance change and browser-tested before rollout.

## HTTPS and HSTS

HSTS belongs at the HTTPS termination layer, not in the application configuration. The reverse proxy/load balancer should redirect HTTP to HTTPS and emit an HSTS policy appropriate for the deployment domain only after HTTPS is known to be correct. Do not enable HSTS blindly for local HTTP development or domains that contain unrelated HTTP-only subdomains.

## Validation surface

Because the security headers use `/:path*`, the policy covers public login/registration pages, authenticated dashboard/key-generation routes, and Auth.js endpoints. Changes to the policy should run the repository test/build gate and be smoke-tested in a browser for login, registration, key generation, dashboard navigation, logout, and authentication callbacks before deployment.
