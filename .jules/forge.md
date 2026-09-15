# Forge's Journal - Critical Learnings

## 2026-09-15 - Node's test runner needs a resolver hook for extensionless imports
**Learning:** The repo's test convention is `lib/*.test.ts` with `node:test` and no test dependency. Node's built-in TypeScript loader only resolves imports with explicit extensions, but `tsconfig` (`moduleResolution: bundler`, no `allowImportingTsExtensions`) rejects `.ts` in import paths and must not be edited. Tests written with the codebase's normal extensionless imports therefore fail with `ERR_MODULE_NOT_FOUND` under plain `node --test`.
**Action:** Run tests with `node --import ./scripts/test-register.mjs --test lib/*.test.ts`; the preload registers a resolve hook that retries relative imports with `.ts`. Keep test files importing extensionless so `next build` typechecking stays green.
