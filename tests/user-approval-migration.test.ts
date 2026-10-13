import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Upgrading an existing install must not lock out the accounts already in it,
// and every account created afterwards must start out waiting for approval.
const adminUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;

function foldersBeforeAndAfter(tag: string) {
  const before = mkdtempSync(join(tmpdir(), "pgpkeygen-migrations-"));
  cpSync(migrationsFolder, before, { recursive: true });
  const journalPath = join(before, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const cut = journal.entries.findIndex((entry: { tag: string }) => entry.tag === tag);
  assert.ok(cut > 0, `migration ${tag} not found`);
  journal.entries = journal.entries.slice(0, cut);
  writeFileSync(journalPath, JSON.stringify(journal));
  return before;
}

test("migration 0007 keeps existing accounts active and makes new ones pending", async (t) => {
  if (!adminUrl) {
    if (process.env.CI) assert.fail("TEST_DATABASE_URL must be set in CI");
    t.skip("TEST_DATABASE_URL not set; skipping live PostgreSQL migration test");
    return;
  }

  const database = `approval_migration_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  const pool = new pg.Pool({ connectionString: url.toString() });
  const before = foldersBeforeAndAfter("0007_user_approval");

  try {
    await migrate(drizzle(pool), { migrationsFolder: before });
    await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ('existing@example.test', 'x', 'user'), ('boss@example.test', 'x', 'admin')",
    );

    await migrate(drizzle(pool), { migrationsFolder });

    const existing = await pool.query("SELECT email, status FROM users ORDER BY email");
    assert.deepEqual(existing.rows, [
      { email: "boss@example.test", status: "active" },
      { email: "existing@example.test", status: "active" },
    ]);

    const created = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ('new@example.test', 'x') RETURNING status",
    );
    assert.equal(created.rows[0].status, "pending", "an insert without a status must start pending");

    await assert.rejects(
      pool.query("INSERT INTO users (email, password_hash, status) VALUES ('odd@example.test', 'x', 'approved')"),
      (err: { code?: string }) => {
        assert.equal(err.code, "23514", "unknown statuses must violate the check constraint");
        return true;
      },
    );
  } finally {
    await pool.end();
    rmSync(before, { recursive: true, force: true });
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
