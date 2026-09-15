// Applies any pending SQL migrations in ./drizzle. Uses drizzle-orm's migrator
// (a runtime dependency) rather than drizzle-kit (dev-only), so it can run inside
// the production Docker image before the server starts. Safe to run repeatedly:
// applied migrations are tracked in the same drizzle.__drizzle_migrations table
// that `pnpm db:migrate` uses, so the two can be mixed freely.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("migrate: DATABASE_URL is not set");
  process.exit(1);
}

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");
const pool = new pg.Pool({ connectionString });

try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.log("migrate: database is up to date");
} catch (err) {
  console.error("migrate: failed", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
