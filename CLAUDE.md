@AGENTS.md

# pgpkeygen

A self-hosted PGP key management app. Users generate PGP keys, store them, and escrow the
passphrases that open them. Multi-user with per-account login.

**Stack:** Next.js, React, next-auth, Drizzle, PostgreSQL, openpgp.js (already a dependency —
use it; docs at https://docs.openpgpjs.org/).

---

## How to behave here

**Disagreement is part of the job.** The maintainer has said plainly he does not want an
agent that agrees with everything. When his plan has a flaw, say so in a sentence or two
with the evidence, then continue the work under stated assumptions. Do not stop to ask
permission to disagree, and do not soften a real objection into a hint.

**Verify before you assert.** A claim recalled from memory is a guess. If you say a key is
rejected, an API behaves a certain way, or a fix works — run it first. Claims presented as
confirmed when they were not are the most expensive mistake anyone can make on this repo,
because they get acted on.

**Correct the record where the wrong claim landed.** If you asserted something wrong in an
issue or PR, correct it there, not only in chat.

**Do not remove an existing capability** to close a gap, simplify a fix, or make a test pass.
This is a hard rule from issue #33. If a feature is genuinely in the way, say so and let the
maintainer decide.

---

## The verification gate

Never report work as done on the strength of a green test suite alone. In this repo, suites
have passed with the security control deliberately broken (PRs #41, #42, #49). "Tests pass"
is not evidence.

Before claiming anything is finished:

1. **`pnpm check`** must pass — it runs lint, typecheck, tests, a high-severity dependency
   audit, and a build. Run it, don't assume it.
2. **Mutation test any security control you touched or added a test for.** Break the control
   on purpose, re-run the suite, confirm it goes red, then restore. A suite that stays green
   does not cover what it claims and must be fixed before the work lands.
3. **Exercise user-facing flows in the real app**, against a real database, not only in unit
   tests. `pnpm dev` and Chromium are available.
4. **Reject grep-shaped tests.** A test that `readFileSync`s a source file and regexes it
   proves text exists, not that code works. See issue #43.

If a step fails or you skipped it, say so with the output. Do not round up to "done".

---

## Invariants — breaking any of these is a security bug, not a design change

**The server never sees a passphrase or a plaintext private key.** Keys are generated in the
browser by openpgp.js. Anything that would send secret material to the server is wrong, no
matter how convenient.

**Two-layer envelope encryption:**

```
account password
  -> PBKDF2-SHA-256, 600,000 iterations -> KEK
  -> KEK wraps a random 256-bit vault key (AES-GCM)
  -> vault key encrypts each per-key PGP passphrase (AES-GCM)
```

**Escrow AAD is rebuilt at decrypt time and never stored:**

```
pgpkeygen:passphrase-escrow:v1\0{userId}\0{fingerprint}
```

It binds a ciphertext to one user and one key. Removing or weakening it allows ciphertext
transplant between users. Do not "simplify" it away.

**Private key material must be encrypted before it is persisted.** `lib/pgp-validation.ts`
enforces this; keep it enforced.

**`crypto.subtle` requires a secure context** — HTTPS, localhost, or file://. On plain HTTP
it is undefined and the app cannot encrypt at all. This is why production deployment requires
TLS termination. HTTPS here protects code integrity, not the encryption itself.

**The vault key lives in React state only** (`app/VaultProvider.tsx`), unlocked at sign-in and
dropped on reload. Reveal re-prompts for the password on purpose — that is step-up auth, not a
bug to smooth over.

---

## Code conventions that matter

**Injectable environment.** Security-relevant logic takes its transaction, clock, and rate
limiter as parameters rather than reaching for globals — see `lib/password-change-request.ts`,
`lib/key-import-transaction.ts`, `lib/vault-rotation.ts`. This is what makes the behaviour
testable. Follow it for new logic in the same area.

**Per-user serialisation.** Key creation takes `pg_advisory_xact_lock(hashtext(userId))` so
quota checks cannot race. Keep new per-user quota logic inside that lock.

**Next.js here is not the Next.js in your training data.** Read the relevant guide under
`node_modules/next/dist/docs/` before writing framework code.

---

## Known open problems — do not rediscover these

- `package.json` says `version: 0.1.0` while tags `v1.0.0` and `v1.1.0` exist. There is no
  `CHANGELOG.md`.
- The test added by PR #49 cannot fail: reverting the fix leaves the suite fully green.
- Forgotten passwords: decided by the maintainer for issue #36 (see `docs/password-reset.md`).
  A reset needs an admin-issued single-use token. With the user's own **recovery code** (a
  second envelope over the same vault key) the escrowed passphrases survive. Without one, a
  **forced reset** clears the vault and escrow on purpose, and that is the only reset allowed
  to. Never give administrators or the server a way to open a user's vault key.
