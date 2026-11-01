import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

// Single module every query goes through (CLAUDE.md → Data layer).

let _db: NeonHttpDatabase<typeof schema> | undefined;

function db() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _db = drizzle({ client: neon(url), schema });
  }
  return _db;
}

export async function findUserByEmail(email: string) {
  const [row] = await db().select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  return row;
}

export async function findUserById(id: string) {
  const [row] = await db().select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return row;
}

/** Returns the new user, or undefined if the email is already taken. */
export async function createUser(input: { email: string; name: string; passwordHash: string }) {
  const [row] = await db()
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
  await db().insert(schema.activityLog).values({
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    metaJson: entry.meta,
  });
}
