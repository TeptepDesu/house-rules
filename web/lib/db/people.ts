import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "./conn";
import type { VaultPayee } from "@/lib/near/policy";
import { payeeVaultStatus } from "@/lib/vault/rules";
import { payees, properties } from "./schema";

// Payees and properties. Every query is scoped to the operator (userId); ids from the client
// are only ever used together with that scope.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function listPayees(userId: string) {
  return (await db()).select().from(payees).where(eq(payees.userId, userId)).orderBy(asc(payees.createdAt));
}

export async function createPayee(
  userId: string,
  p: { name: string; role: "owner" | "cleaner"; nearAccount: string; capRaw: bigint },
): Promise<Result<{ id: string }>> {
  const [row] = await (await db())
    .insert(payees)
    .values({ userId, ...p })
    .onConflictDoNothing()
    .returning({ id: payees.id });
  return row ? { ok: true, id: row.id } : { ok: false, error: "duplicate_account" };
}

async function ownsPayee(userId: string, id: string | undefined, role: "owner" | "cleaner") {
  if (id === undefined) return true;
  if (!UUID_RE.test(id)) return false;
  const [r] = await (await db())
    .select({ id: payees.id })
    .from(payees)
    .where(and(eq(payees.id, id), eq(payees.userId, userId), eq(payees.role, role)))
    .limit(1);
  return !!r;
}

export async function createProperty(
  userId: string,
  p: { name: string; ownerPayeeId?: string; cleanerPayeeId?: string; cleaningFeeRaw: bigint; mgmtFeeBps: number },
): Promise<Result<{ id: string }>> {
  if (!(await ownsPayee(userId, p.ownerPayeeId, "owner"))) return { ok: false, error: "invalid_owner" };
  if (!(await ownsPayee(userId, p.cleanerPayeeId, "cleaner"))) return { ok: false, error: "invalid_cleaner" };
  const [row] = await (await db())
    .insert(properties)
    .values({ userId, ...p })
    .onConflictDoNothing()
    .returning({ id: properties.id });
  return row ? { ok: true, id: row.id } : { ok: false, error: "duplicate_name" };
}

export async function listProperties(userId: string) {
  const owner = alias(payees, "owner");
  const cleaner = alias(payees, "cleaner");
  return (await db())
    .select({
      id: properties.id,
      name: properties.name,
      cleaningFeeRaw: properties.cleaningFeeRaw,
      mgmtFeeBps: properties.mgmtFeeBps,
      ownerName: owner.name,
      ownerAccount: owner.nearAccount,
      cleanerName: cleaner.name,
      cleanerAccount: cleaner.nearAccount,
    })
    .from(properties)
    .leftJoin(owner, eq(owner.id, properties.ownerPayeeId))
    .leftJoin(cleaner, eq(cleaner.id, properties.cleanerPayeeId))
    .where(eq(properties.userId, userId))
    .orderBy(asc(properties.name));
}

export async function setupCounts(userId: string) {
  const d = await db();
  const [[p], [a], [pr]] = await Promise.all([
    d.select({ n: count() }).from(payees).where(eq(payees.userId, userId)),
    d.select({ n: count() }).from(payees).where(and(eq(payees.userId, userId), eq(payees.vaultStatus, "active"))),
    d.select({ n: count() }).from(properties).where(eq(properties.userId, userId)),
  ]);
  return { payees: p.n, activePayees: a.n, properties: pr.n };
}

export async function getPayee(userId: string, payeeId: string) {
  if (!UUID_RE.test(payeeId)) return null;
  const [p] = await (await db()).select().from(payees).where(and(eq(payees.id, payeeId), eq(payees.userId, userId)));
  return p ?? null;
}

export async function setPayeeVaultStatus(userId: string, payeeId: string, status: "pending_signature" | "in_delay" | "active" | "removed", addedTx?: string) {
  await (await db())
    .update(payees)
    .set({ vaultStatus: status, ...(addedTx ? { addedTx } : {}) })
    .where(and(eq(payees.id, payeeId), eq(payees.userId, userId)));
}

/** Mirror the vault's view of each payee into the app (the chain is the source of truth). */
export async function syncPayeeStatuses(userId: string, chain: VaultPayee[], nowNs: bigint) {
  const d = await db();
  const byAccount = new Map(chain.map((p) => [p.accountId, p]));
  for (const p of await listPayees(userId)) {
    const status = payeeVaultStatus(byAccount.get(p.nearAccount), nowNs);
    if (status !== p.vaultStatus) {
      await d.update(payees).set({ vaultStatus: status }).where(and(eq(payees.id, p.id), eq(payees.userId, userId)));
    }
  }
}

export async function setPayeeCap(userId: string, payeeId: string, capRaw: bigint) {
  await (await db())
    .update(payees)
    .set({ capRaw })
    .where(and(eq(payees.id, payeeId), eq(payees.userId, userId)));
}
