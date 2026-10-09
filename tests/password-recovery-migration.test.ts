import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Constraints that keep recovery state consistent are enforced by Postgres,
// so only a live database shows they hold.
const adminUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;

async function expectCode(promise: Promise<unknown>, code: string, why: string) {
  await assert.rejects(promise, (err: { code?: string }) => {
    assert.equal(err.code, code, why);
    return true;
  });
}

test("recovery columns are all-or-nothing and password resets are one per account", async (t) => {
  if (!adminUrl) {
    if (process.env.CI) assert.fail("TEST_DATABASE_URL must be set in CI");
    t.skip("TEST_DATABASE_URL not set; skipping live PostgreSQL migration test");
    return;
  }

  const database = `recovery_migration_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  const pool = new pg.Pool({ connectionString: url.toString() });

  try {
    await migrate(drizzle(pool), { migrationsFolder });
    const { rows: [user] } = await pool.query(
      "INSERT INTO users (email, password_hash, status) VALUES ('u@example.test', 'x', 'active') RETURNING id, recovery_wrapped_key",
    );
    assert.equal(user.recovery_wrapped_key, null, "accounts start without a recovery code");

    await expectCode(
      pool.query("UPDATE users SET recovery_wrapped_key = 'w', recovery_kdf_salt = 's' WHERE id = $1", [user.id]),
      "23514",
      "partial recovery state must be refused",
    );
    await pool.query(
      `UPDATE users SET recovery_wrapped_key = 'w', recovery_kdf_salt = 's', recovery_kdf_iv = 'i',
         recovery_kdf_iterations = 600000, recovery_wrap_version = 1,
         recovery_verifier_hash = repeat('a', 64), recovery_created_at = now() WHERE id = $1`,
      [user.id],
    );
    await expectCode(
      pool.query("UPDATE users SET recovery_verifier_hash = NULL WHERE id = $1", [user.id]),
      "23514",
      "clearing one recovery column alone must be refused",
    );

    const reset = (mode: string) =>
      pool.query(
        "INSERT INTO password_resets (user_id, token_hash, mode, issued_by, expires_at) VALUES ($1, repeat('b', 64), $2, 'admin@example.test', now() + interval '1 hour')",
        [user.id, mode],
      );
    await expectCode(reset("email"), "23514", "unknown reset modes must be refused");
    await reset("recovery");
    await expectCode(reset("forced"), "23505", "only one active reset per account");

    await pool.query("DELETE FROM users WHERE id = $1", [user.id]);
    const { rowCount } = await pool.query("SELECT 1 FROM password_resets");
    assert.equal(rowCount, 0, "a deleted account takes its reset with it");
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
