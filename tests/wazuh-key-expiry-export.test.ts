import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Runs the real deploy/wazuh files against a real PostgreSQL server: the role
// script for what wazuh_ro may read, and the export script end to end for
// what lands in the file the Wazuh agent reads.
// TEST_DATABASE_URL must be a superuser (CI's is): the test creates a database
// and a role, and reads pg_authid to check that wazuh_ro has no password.
const adminUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const roleSql = readFileSync(new URL("../deploy/wazuh/wazuh-role.sql", import.meta.url), "utf8");
const exportScript = new URL("../deploy/wazuh/export-key-expiry.sh", import.meta.url).pathname;

const KEY_FIELDS = [
  "app",
  "event_type",
  "exported_at",
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

function runExport(databaseUrl: string, exportFile: string) {
  return spawnSync("bash", [exportScript], {
    env: { ...process.env, EXPORT_DATABASE_URL: databaseUrl, EXPORT_FILE: exportFile },
    encoding: "utf8",
  });
}

function readLines(file: string): Record<string, unknown>[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line));
}

test("wazuh_ro reads only the view, and the export writes one valid JSON line per key", async (t) => {
  if (!adminUrl) {
    if (process.env.CI) assert.fail("TEST_DATABASE_URL must be set in CI");
    t.skip("TEST_DATABASE_URL not set; skipping live PostgreSQL export test");
    return;
  }
  try {
    execFileSync("psql", ["--version"]);
  } catch {
    if (process.env.CI) assert.fail("psql must be installed in CI");
    t.skip("psql not installed; skipping live export test");
    return;
  }

  const database = `wazuh_export_test_${randomBytes(6).toString("hex")}`;
  const password = randomBytes(18).toString("base64url");
  const workDir = mkdtempSync(join(tmpdir(), "wazuh-export-"));
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();

  const existingRole = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = 'wazuh_ro'");
  const createdRole = existingRole.rowCount === 0;

  await admin.query(`CREATE DATABASE "${database}"`);
  const owner = new pg.Pool({ connectionString: withDatabase(adminUrl, database) });
  let wazuh: pg.Client | undefined;

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
         (E'tricky "title"\\nwith a newline', 'FP-EXPIRING', now() + interval '10 days', NULL),
         ('healthy key',  'FP-HEALTHY',  now() + interval '200 days', NULL),
         ('forever key',  'FP-NEVER',    NULL,                        NULL),
         ('revoked key',  'FP-REVOKED',  now() - interval '1 day',    now())
       ) AS v(title, fp, expires_at, revoked_at)`,
      [user.id],
    );

    // Role settings outlive this database. Clear any left on an existing
    // wazuh_ro, so what the checks below see comes from the script alone.
    if (!createdRole) await admin.query("ALTER ROLE wazuh_ro RESET ALL");
    await owner.query(roleSql);
    const { rows: [noPassword] } = await admin.query(
      "SELECT rolpassword IS NULL AS empty FROM pg_authid WHERE rolname = 'wazuh_ro'",
    );
    assert.equal(noPassword.empty, true, "wazuh_ro must not have a password: it logs in over the local socket only");

    // The deployment connects over the container's socket; here the test
    // connects over TCP, which needs a password for the duration of the test.
    await owner.query(`ALTER ROLE wazuh_ro PASSWORD '${password}'`);
    const wazuhUrl = withDatabase(adminUrl, database, "wazuh_ro", password);
    wazuh = new pg.Client({ connectionString: wazuhUrl });
    await wazuh.connect();

    await expectDenied(wazuh, "SELECT private_key FROM pgp_keys LIMIT 1");
    await expectDenied(wazuh, "SELECT escrow_ciphertext FROM pgp_keys LIMIT 1");
    await expectDenied(wazuh, "SELECT password_hash FROM users LIMIT 1");
    await expectDenied(wazuh, "SELECT vault_wrapped_key FROM users LIMIT 1");
    await expectDenied(wazuh, "SELECT * FROM audit_log LIMIT 1");
    await assert.rejects(wazuh.query("CREATE TEMP TABLE probe (i int)"), (err: { code?: string }) => {
      assert.equal(err.code, "25006", "wazuh_ro sessions must be read-only");
      return true;
    });
    const { rows: [attrs] } = await admin.query(
      "SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication FROM pg_roles WHERE rolname = 'wazuh_ro'",
    );
    assert.deepEqual(attrs, {
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
      rolreplication: false,
    });

    // The export script itself, as wazuh_ro.
    const exportFile = join(workDir, "key-expiry.json");
    const run = runExport(wazuhUrl, exportFile);
    assert.equal(run.status, 0, `export failed: ${run.stderr}`);

    const raw = readFileSync(exportFile, "utf8");
    assert.doesNotMatch(raw, /MATERIAL|not-a-real-hash/, "secret material leaked into the export");
    const lines = readLines(exportFile);
    assert.equal(lines.length, 6, "five key lines and one summary line");

    const keys = lines.filter((line) => line.event_type === "key_expiry");
    for (const key of keys) {
      assert.deepEqual(Object.keys(key), KEY_FIELDS, "each key line carries exactly the view's fields");
      assert.equal(key.app, "pgpkeygen");
    }
    assert.deepEqual(
      keys.map((k) => [k.fingerprint, k.expiry_status, k.days_remaining]).sort(),
      [
        ["FP-EXPIRED", "expired", -2],
        ["FP-EXPIRING", "expiring", 10],
        ["FP-HEALTHY", "healthy", 200],
        ["FP-NEVER", "never", null],
        ["FP-REVOKED", "revoked", -1],
      ],
    );
    assert.equal(
      keys.find((k) => k.fingerprint === "FP-EXPIRING")?.title,
      'tricky "title"\nwith a newline',
      "a title with quotes and a newline must survive as one JSON line",
    );
    assert.equal(new Set(lines.map((l) => l.exported_at)).size, 1, "one run, one timestamp");

    assert.deepEqual(lines.at(-1), {
      app: "pgpkeygen",
      event_type: "export_summary",
      exported_at: lines[0].exported_at,
      keys_total: 5,
      expired: 1,
      expiring: 1,
      revoked: 1,
      healthy: 1,
      never: 1,
    });

    // A second run appends; the collector reads only the new lines.
    assert.equal(runExport(wazuhUrl, exportFile).status, 0);
    assert.equal(readLines(exportFile).length, 12);

    // A failed run must leave a failure event for the SIEM, not just stop.
    const failed = runExport(withDatabase(adminUrl, database, "wazuh_ro", "wrong-password"), exportFile);
    assert.notEqual(failed.status, 0);
    const last = readLines(exportFile).at(-1);
    assert.equal(last?.event_type, "export_failed");
    assert.equal(last?.reason, "query_failed");
    assert.equal(readLines(exportFile).length, 13, "a failed run adds only its failure line");

    // Re-running the role script removes grants and passwords added by hand.
    await owner.query("GRANT SELECT ON pgp_keys, users TO wazuh_ro");
    await owner.query(roleSql);
    await expectDenied(wazuh, "SELECT private_key FROM pgp_keys LIMIT 1");
    await expectDenied(wazuh, "SELECT password_hash FROM users LIMIT 1");
    const { rows: [cleared] } = await admin.query(
      "SELECT rolpassword IS NULL AS empty FROM pg_authid WHERE rolname = 'wazuh_ro'",
    );
    assert.equal(cleared.empty, true, "re-running the role script must clear a password set by hand");
  } finally {
    await wazuh?.end();
    await owner.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    if (createdRole) await admin.query("DROP ROLE IF EXISTS wazuh_ro");
    await admin.end();
    rmSync(workDir, { recursive: true, force: true });
  }
});
