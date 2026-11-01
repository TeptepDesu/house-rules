import "server-only";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "./client";
import * as schema from "./schema";

// Single module every query goes through (CLAUDE.md → Data layer).

let _db: Promise<Db> | undefined;
function db(): Promise<Db> {
  // Don't cache a failed connection: the next call retries instead of failing forever.
  _db ??= createDb().catch((e) => {
    _db = undefined;
    throw e;
  });
  return _db;
}

export async function findUserByEmail(email: string) {
  const [row] = await (await db()).select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  return row;
}

export async function findUserById(id: string) {
  const [row] = await (await db()).select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return row;
}

/** Returns the new user, or undefined if the email is already taken. */
export async function createUser(input: { email: string; name: string; passwordHash: string }) {
  const [row] = await (await db())
    .insert(schema.users)
    .values(input)
    .onConflictDoNothing({ target: schema.users.email })
    .returning();
  return row;
}

export async function logActivity(entry: {
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}) {
  await (await db()).insert(schema.activityLog).values({
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    metaJson: entry.meta,
  });
}

/** Test-only: reset the cached client so a test can point PGLITE_DIR somewhere fresh. */
export function __resetDbForTests() {
  _db = undefined;
}
