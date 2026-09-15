import process from "node:process";
import pg from "pg";

const email = process.argv[2]?.trim().toLowerCase();
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("admin:promote: DATABASE_URL is not set");
  process.exit(1);
}

if (!email || !email.includes("@")) {
  console.error("admin:promote: usage: pnpm admin:promote -- user@example.com");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

try {
  const result = await pool.query(
    "update users set role = 'admin' where lower(email) = $1 returning email",
    [email],
  );

  if (result.rowCount !== 1) {
    console.error("admin:promote: exactly one existing user must match that email");
    process.exitCode = 1;
  } else {
    console.log(`admin:promote: promoted ${result.rows[0].email}`);
  }
} catch (error) {
  console.error("admin:promote: failed", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  await pool.end();
}
