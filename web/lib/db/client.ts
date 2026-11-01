import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// One Postgres client for the whole app.
//   DATABASE_URL set   → node-postgres (any hosted Postgres: Neon, Supabase, RDS, local server)
//   DATABASE_URL unset → PGlite (real Postgres compiled to WASM, in-process) for local dev and tests.
//                        Data lives in PGLITE_DIR (default .data/pglite; "memory://" for tests).
// Production never falls back to PGlite.

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = `${process.cwd()}/drizzle`;

export async function createDb(env: NodeJS.ProcessEnv = process.env): Promise<Db> {
  if (env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });
    return drizzle({ client: pool, schema }) as unknown as Db;
  }
  if (env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is not set (PGlite is for local dev and tests only)");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = env.PGLITE_DIR ?? `${process.cwd()}/.data/pglite`;
  if (!dir.includes("://")) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true }); // PGlite's own mkdir isn't recursive
  }
  const client = new PGlite(dir);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}
