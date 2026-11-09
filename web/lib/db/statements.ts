import "server-only";
import { and, eq, isNull, ne } from "drizzle-orm";
import { newPublicId } from "@/lib/ids";
import type { StatementRow } from "@/lib/statement";
import { db } from "./conn";
import { bookings, payees, payoutSplits, properties, settlementTxs, users } from "./schema";

// Payee statements: an owner's or cleaner's read-only view of their own payouts. The operator shares
// a link with an unguessable token; the public page looks the payee up by that token only and gets a
// narrow view: no guest names, no other payee's amounts, no operator internals.

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

/**
 * The payee's statement token, created on first share (created: true) and the same after.
 * Null if the payee isn't this operator's.
 */
export async function statementLink(userId: string, payeeId: string): Promise<{ token: string; created: boolean; payeeName: string; nearAccount: string } | null> {
  const d = await db();
  const where = and(eq(payees.id, payeeId), eq(payees.userId, userId));
  const cols = { token: payees.statementToken, payeeName: payees.name, nearAccount: payees.nearAccount };
  // set once: a concurrent first share can't overwrite a token someone already received
  const [made] = await d.update(payees).set({ statementToken: newPublicId() }).where(and(where, isNull(payees.statementToken))).returning(cols);
  if (made?.token) return { ...made, token: made.token, created: true };
  const [p] = await d.select(cols).from(payees).where(where);
  return p?.token ? { ...p, token: p.token, created: false } : null;
}

export async function getPayeeStatement(token: string): Promise<{
  businessName: string;
  payee: { name: string; role: "owner" | "cleaner"; nearAccount: string };
  rows: StatementRow[];
} | null> {
  if (!TOKEN_RE.test(token)) return null;
  const d = await db();
  const [p] = await d
    .select({ id: payees.id, name: payees.name, role: payees.role, nearAccount: payees.nearAccount, businessName: users.name })
    .from(payees)
    .innerJoin(users, eq(users.id, payees.userId))
    .where(and(eq(payees.statementToken, token), ne(payees.vaultStatus, "removed"))); // a removed payee's link stops working
  if (!p) return null;
  const rows = await d
    .select({
      splitId: payoutSplits.id,
      role: payoutSplits.role,
      amountRaw: payoutSplits.amountRaw,
      status: payoutSplits.status,
      reason: payoutSplits.reason,
      propertyName: properties.name,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      txHash: settlementTxs.txHash,
    })
    .from(payoutSplits)
    .innerJoin(bookings, eq(bookings.id, payoutSplits.bookingId))
    .leftJoin(properties, eq(properties.id, bookings.propertyId))
    .leftJoin(settlementTxs, eq(settlementTxs.id, payoutSplits.settlementTxId))
    .where(eq(payoutSplits.payeeId, p.id));
  return { businessName: p.businessName, payee: { name: p.name, role: p.role, nearAccount: p.nearAccount }, rows };
}
