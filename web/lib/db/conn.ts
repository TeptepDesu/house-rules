import "server-only";
import { createDb, type Db } from "./client";

// One cached connection for the process. Every query module in lib/db uses this.
let _db: Promise<Db> | undefined;

export function db(): Promise<Db> {
  // Don't cache a failed connection: the next call retries instead of failing forever.
  _db ??= createDb().catch((e) => {
    _db = undefined;
    throw e;
  });
  return _db;
}

/** Test-only: reset the cached client so a test can point PGLITE_DIR somewhere fresh. */
export function __resetDbForTests() {
  _db = undefined;
}
