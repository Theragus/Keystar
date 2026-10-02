import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies pending SQL migrations from ./drizzle. Safe to run from several
 * processes at once (app + worker): a Postgres advisory lock serialises them.
 */
export async function runMigrations(databaseUrl: string, migrationsFolder = path.resolve(process.cwd(), "drizzle")) {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await client`SELECT pg_advisory_lock(727274)`;
    await migrate(drizzle(client), { migrationsFolder });
    await client`SELECT pg_advisory_unlock(727274)`;
  } finally {
    await client.end({ timeout: 5 });
  }
}

const isMain = process.argv[1] && /migrate\.(ts|mjs|js)$/.test(process.argv[1]);
if (isMain) {
  const url = process.env.DATABASE_URL ?? "postgres://keystar:keystar@localhost:5432/keystar";
  runMigrations(url)
    .then(() => {
      console.log("Migrations applied");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
