import "server-only";
import { createDb, type Db } from "./client";

// One connection per server process. Next dev bundles pages and route handlers separately, so a
// plain module-level cache gave each bundle its own client: two PGlite instances on the same data
// dir (found by E2E: the pay API couldn't see invoices the pay page had just read). Keep it on
// globalThis so every bundle shares it. Harmless with node-postgres too (one pool per process).

type Holder = { __hrDb?: Promise<Db> };
const g = globalThis as unknown as Holder;

export function db(): Promise<Db> {
  // Don't cache a failed connection: the next call retries instead of failing forever.
  g.__hrDb ??= createDb().catch((e) => {
    g.__hrDb = undefined;
    throw e;
  });
  return g.__hrDb;
}

/** Test-only: reset the cached client so a test can point PGLITE_DIR somewhere fresh. */
export function __resetDbForTests() {
  g.__hrDb = undefined;
}
