// Apply drizzle/ migrations to the Postgres at DATABASE_URL.
// Local PGlite migrates itself on startup, so this is only for hosted databases.
//   pnpm --filter web db:migrate
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. (Local dev uses PGlite, which migrates itself.)");
  process.exit(1);
}
const host = new URL(url).host;
console.log(`Migrating ${host} …`);
const pool = new Pool({ connectionString: url, max: 1 });
await migrate(drizzle({ client: pool }), { migrationsFolder: `${process.cwd()}/drizzle` });
await pool.end();
console.log("Done.");
