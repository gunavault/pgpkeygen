# Testing and TDD

PGPKeyGen is security-sensitive. Behavioral changes should be developed test-first whenever the behavior can be exercised deterministically.

## Required cycle

For a bug fix or security fix:

1. **Red** — add a regression test that demonstrates the broken or unsafe behavior and confirm it fails for the expected reason.
2. **Green** — implement the smallest change that makes the new test pass without weakening existing checks.
3. **Refactor** — improve structure while keeping the complete suite green.
4. Run the full validation gate before opening or updating the pull request.

Do not rewrite a failing test merely to match an implementation unless the intended behavior itself has been reviewed and changed.

## Local commands

The test suite uses Node 22's built-in test runner with TypeScript type stripping, so no additional test framework is required.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm test:coverage
pnpm typecheck
pnpm lint
pnpm audit
pnpm build
```

Run the complete required validation gate with:

```sh
pnpm check
```

CI runs lint, TypeScript checking, tests, dependency auditing, and the production build on every push and pull request.

The initial dependency-audit gate fails on **critical** advisories. Issue #13 tracks upgrading Nodemailer and tightening the policy after the known dependency debt is removed; lowering the threshold to hide a newly introduced critical advisory is not acceptable.

## What should be tested first

Prioritize tests around trust boundaries and irreversible behavior:

- authentication and authorization;
- admin provisioning and role checks;
- password handling and login throttling;
- PGP key parsing, metadata validation, revocation, and deletion;
- user ownership boundaries;
- server actions receiving security-sensitive input;
- SMTP/passphrase behavior while that feature exists;
- database/deployment security invariants where they can be validated automatically.

Tests must use synthetic identities, keys, and credentials. Never commit a real private key, passphrase, SMTP credential, production database URL, or personal data as test material.

## Current foundation

The initial suite covers password hashing/verification and the fixed-window rate-limit state machine. The limiter's clock is injected deliberately so future security changes can start with deterministic failing tests instead of framework mocks.

Issue #12 tracks expansion of this baseline, and security findings should add focused regression coverage as they are addressed.
