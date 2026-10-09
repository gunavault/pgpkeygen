import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Runs against a real PostgreSQL server: privileges are enforced by Postgres,
// so only a live database can show what splunk_ro can and cannot read.
// TEST_DATABASE_URL must be a role allowed to CREATE DATABASE and CREATE ROLE.
// The test works in a throwaway database it creates and drops.
const adminUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const roleSql = readFileSync(new URL("../deploy/splunk/splunk-role.sql", import.meta.url), "utf8");

const EXPECTED_COLUMNS = [
  "key_id",
  "title",
  "fingerprint",
  "algorithm",
  "owner_email",
  "created_at",
  "expires_at",
  "revoked_at",
  "expiry_status",
  "days_remaining",
];

function withDatabase(url: string, database: string, user?: string, password?: string) {
  const next = new URL(url);
  next.pathname = `/${database}`;
  if (user !== undefined) next.username = user;
  if (password !== undefined) next.password = password;
  return next.toString();
}

async function expectDenied(client: pg.Client, sql: string) {
  await assert.rejects(client.query(sql), (err: { code?: string }) => {
    assert.equal(err.code, "42501", `expected permission denied for: ${sql}`);
    return true;
  });
}

test("splunk_ro reads key expiry through soc_key_expiry and nothing else", async (t) => {
  if (!adminUrl) {
    if (process.env.CI) assert.fail("TEST_DATABASE_URL must be set in CI");
    t.skip("TEST_DATABASE_URL not set; skipping live PostgreSQL privilege test");
    return;
  }

  const database = `soc_view_test_${randomBytes(6).toString("hex")}`;
  const splunkPassword = randomBytes(18).toString("base64url");
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();

  const existingRole = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = 'splunk_ro'");
  const createdRole = existingRole.rowCount === 0;

  await admin.query(`CREATE DATABASE "${database}"`);
  const owner = new pg.Pool({ connectionString: withDatabase(adminUrl, database) });
  let splunk: pg.Client | undefined;

  try {
    await migrate(drizzle(owner), { migrationsFolder });

    const { rows: [user] } = await owner.query(
      "INSERT INTO users (email, password_hash) VALUES ('owner@example.test', 'not-a-real-hash') RETURNING id",
    );
    await owner.query(
      `INSERT INTO pgp_keys
         (user_id, title, name, email, algorithm, fingerprint, public_key, private_key,
          escrow_ciphertext, revocation_certificate, expires_at, revoked_at)
       SELECT $1, v.title, 'Synthetic', 'synthetic@example.test', 'ed25519', v.fp,
              'PUBLIC-MATERIAL', 'PRIVATE-MATERIAL', 'ESCROW-MATERIAL', 'REVOCATION-MATERIAL',
              v.expires_at, v.revoked_at
       FROM (VALUES
         ('expired key',  'FP-EXPIRED',  now() - interval '2 days',   NULL::timestamptz),
         ('expiring key', 'FP-EXPIRING', now() + interval '10 days',  NULL),
         ('healthy key',  'FP-HEALTHY',  now() + interval '200 days', NULL),
         ('forever key',  'FP-NEVER',    NULL,                        NULL),
         ('revoked key',  'FP-REVOKED',  now() - interval '1 day',    now())
       ) AS v(title, fp, expires_at, revoked_at)`,
      [user.id],
    );

    await owner.query(roleSql);
    await owner.query(`ALTER ROLE splunk_ro PASSWORD '${splunkPassword}'`);

    splunk = new pg.Client({
      connectionString: withDatabase(adminUrl, database, "splunk_ro", splunkPassword),
    });
    await splunk.connect();

    const view = await splunk.query("SELECT * FROM soc_key_expiry ORDER BY fingerprint");
    assert.deepEqual(
      view.fields.map((f) => f.name),
      EXPECTED_COLUMNS,
      "the view must expose exactly the monitoring columns",
    );
    assert.deepEqual(
      view.rows.map((r) => [r.title, r.owner_email, r.expiry_status, r.days_remaining]),
      [
        ["expired key", "owner@example.test", "expired", -2],
        ["expiring key", "owner@example.test", "expiring", 10],
        ["healthy key", "owner@example.test", "healthy", 200],
        ["forever key", "owner@example.test", "never", null],
        ["revoked key", "owner@example.test", "revoked", -1],
      ],
    );
    for (const row of view.rows) {
      for (const value of Object.values(row)) {
        assert.doesNotMatch(String(value), /MATERIAL|not-a-real-hash/, "secret material leaked into the view");
      }
    }

    await expectDenied(splunk, "SELECT private_key FROM pgp_keys LIMIT 1");
    await expectDenied(splunk, "SELECT escrow_ciphertext FROM pgp_keys LIMIT 1");
    await expectDenied(splunk, "SELECT password_hash FROM users LIMIT 1");
    await expectDenied(splunk, "SELECT vault_wrapped_key FROM users LIMIT 1");
    await expectDenied(splunk, "SELECT * FROM audit_log LIMIT 1");

    // PUBLIC may create temp tables by default, so only the role's
    // default_transaction_read_only setting makes this fail.
    await assert.rejects(
      splunk.query("CREATE TEMP TABLE probe (i int)"),
      (err: { code?: string }) => {
        assert.equal(err.code, "25006", "splunk_ro sessions must be read-only");
        return true;
      },
    );

    const { rows: [attrs] } = await admin.query(
      "SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication FROM pg_roles WHERE rolname = 'splunk_ro'",
    );
    assert.deepEqual(attrs, {
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
      rolreplication: false,
    });

    // Re-running the script must remove grants made by hand in the meantime.
    await owner.query("GRANT SELECT ON pgp_keys, users TO splunk_ro");
    await owner.query(roleSql);
    await expectDenied(splunk, "SELECT private_key FROM pgp_keys LIMIT 1");
    await expectDenied(splunk, "SELECT password_hash FROM users LIMIT 1");
  } finally {
    await splunk?.end();
    await owner.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    if (createdRole) await admin.query("DROP ROLE IF EXISTS splunk_ro");
    await admin.end();
  }
});
