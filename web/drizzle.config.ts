import { defineConfig } from "drizzle-kit";

// Used for `db:generate` (SQL from schema), which needs no database.
// Applying migrations: PGlite does it on startup; hosted Postgres uses scripts/migrate.ts.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
});
