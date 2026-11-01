import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./conn";
import * as schema from "./schema";

// All queries go through lib/db (CLAUDE.md → Data layer). Users + activity log live here;
// feature areas have their own files (people.ts, …) on the same connection.
export { __resetDbForTests } from "./conn";

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

/** The operator's NEAR account, set only after a verified NEP-413 wallet link. */
export async function getOperatorAccount(userId: string): Promise<string | null> {
  const [u] = await (await db()).select({ a: schema.users.operatorAccount }).from(schema.users).where(eq(schema.users.id, userId));
  return u?.a ?? null;
}

export async function setOperatorAccount(userId: string, account: string) {
  await (await db()).update(schema.users).set({ operatorAccount: account }).where(eq(schema.users.id, userId));
}
