import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("Docker runtime ships the documented admin promotion script", () => {
  assert.match(
    dockerfile,
    /COPY --from=build --chown=app:app \/app\/scripts\/promote-admin\.mjs \.\/scripts\/promote-admin\.mjs/,
  );
});

test("administrator docs preserve local promotion and document the Docker path", () => {
  assert.match(readme, /pnpm admin:promote -- admin@example\.com/);
  assert.match(
    readme,
    /docker compose exec app node scripts\/promote-admin\.mjs admin@example\.com/,
  );
});

test("administrator docs require re-authentication after promotion", () => {
  assert.match(readme, /sign out and sign back in|re-authenticate/i);
});
