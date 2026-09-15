## Summary

<!-- What changes, why, and which issue does it address? -->

## Behavior and compatibility

<!-- Describe before/after behavior and any migration or deployment impact. -->

## Validation

- [ ] `pnpm lint`
- [ ] `pnpm build`
- [ ] Regression tests added/updated where test infrastructure is available
- [ ] No real private keys, passphrases, revocation certificates, credentials, session secrets, or private user data are included

## Security and user impact

- [ ] Authentication/authorization and user ownership checks remain server-side where applicable
- [ ] Client-controlled security metadata is validated or recomputed rather than blindly trusted
- [ ] Security-sensitive failure paths fail closed rather than falling back to a weaker mode
- [ ] Private key/passphrase/revocation material is not added to logs, analytics, fixtures, screenshots, or error messages
- [ ] Database/schema/deployment changes document compatibility and migration impact
- [ ] New or upgraded security-sensitive dependencies are justified and reviewed
- [ ] User-visible security or deployment behavior is reflected in README/docs where needed

<!-- If an item does not apply, explain briefly rather than checking it mechanically. -->
