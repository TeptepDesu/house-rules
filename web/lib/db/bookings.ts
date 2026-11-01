import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ImportRow } from "@/lib/importers";
import { type BookingForRecon, type Reconciliation, reconcileBooking } from "@/lib/reconcile";
import { db } from "./conn";
import { bookings, invoices, payments, properties } from "./schema";

// Bookings: import + reconciliation views. Every query is scoped to the operator.

type Channel = "airbnb" | "booking_com" | "other";

/** "<channel>:<ref>" → what we already know, for the import preview's duplicate/update logic. */
export async function existingForImport(userId: string, channel: Channel, refs: string[]) {
  const out = new Map<string, { otaPayout?: bigint }>();
  if (refs.length === 0) return out;
  const rows = await (await db())
    .select({ ref: bookings.externalRef, payout: bookings.otaPayoutRaw })
    .from(bookings)
    .where(and(eq(bookings.userId, userId), eq(bookings.channel, channel), inArray(bookings.externalRef, refs)));
  for (const r of rows) out.set(`${channel}:${r.ref}`, { otaPayout: r.payout ?? undefined });
  return out;
}

/**
 * Write an import: "new" rows become OTA bookings, "update" rows fill in a missing payout.
 * Duplicates, flagged and ignored rows are not written. One transaction; safe to repeat.
 * Property ids must come from this operator's own properties (the caller maps listings with them).
 */
export async function applyImport(userId: string, rows: ImportRow[], source: string) {
  const now = new Date();
  return (await db()).transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    for (const r of rows) {
      if (!r.booking) continue;
      const b = r.booking;
      if (r.status === "new") {
        const ins = await tx
          .insert(bookings)
          .values({
            userId,
            propertyId: b.propertyId,
            externalRef: b.externalRef,
            channel: b.channel,
            collectionMode: "ota_payout",
            guestName: b.guestName,
            checkIn: b.checkIn,
            checkOut: b.checkOut,
            expectedGrossRaw: b.expectedNet,
            otaPayoutRaw: b.payout,
            cleaningFeeOverrideRaw: b.cleaningFee,
            source,
            importedAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: bookings.id });
        created += ins.length;
      } else if (r.status === "update") {
        const upd = await tx
          .update(bookings)
          .set({ otaPayoutRaw: b.payout, importedAt: now })
          .where(and(eq(bookings.userId, userId), eq(bookings.channel, b.channel), eq(bookings.externalRef, b.externalRef), isNull(bookings.otaPayoutRaw)))
          .returning({ id: bookings.id });
        updated += upd.length;
      }
    }
    return { created, updated };
  });
}

export type BookingRow = {
  id: string;
  propertyId: string;
  cleaningFeeOverrideRaw: bigint | null;
  /** Paid penalty invoices, for the payout split. */
  paidPenalties: { amount: bigint; operatorRevenue: boolean }[];
  externalRef: string;
  channel: "direct" | Channel;
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  settlementStatus: "unreconciled" | "blocked" | "ready" | "settling" | "settled";
  recon: Reconciliation;
};

/** All bookings with a live reconciliation (pure lib/reconcile over current DB state). */
export async function listBookingsWithRecon(userId: string, now = new Date()): Promise<BookingRow[]> {
  const d = await db();
  const rows = await d
    .select({
      id: bookings.id,
      externalRef: bookings.externalRef,
      channel: bookings.channel,
      collectionMode: bookings.collectionMode,
      guestName: bookings.guestName,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      expectedGrossRaw: bookings.expectedGrossRaw,
      otaPayoutRaw: bookings.otaPayoutRaw,
      settlementStatus: bookings.settlementStatus,
      propertyName: properties.name,
      propertyId: bookings.propertyId,
      cleaningFeeOverrideRaw: bookings.cleaningFeeOverrideRaw,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(eq(bookings.userId, userId))
    .orderBy(asc(bookings.checkIn), asc(bookings.externalRef));

  const ids = rows.map((r) => r.id);
  const invs = ids.length
    ? await d
        .select({
          id: invoices.id,
          bookingId: invoices.bookingId,
          type: invoices.type,
          amount: invoices.amountRaw,
          status: invoices.status,
          operatorRevenue: invoices.operatorRevenue,
          received: sql<string>`coalesce(sum(case when ${payments.status} = 'verified' then ${payments.amountReceivedRaw} else 0 end), 0)`,
        })
        .from(invoices)
        .leftJoin(payments, eq(payments.invoiceId, invoices.id))
        .where(and(eq(invoices.userId, userId), inArray(invoices.bookingId, ids)))
        .groupBy(invoices.id)
    : [];

  return rows.map((r) => {
    const input: BookingForRecon = {
      id: r.id,
      collectionMode: r.collectionMode,
      expectedGross: r.expectedGrossRaw,
      otaPayout: r.otaPayoutRaw ?? undefined,
      dueDate: new Date(`${r.checkOut}T23:59:59Z`),
      invoices: invs
        .filter((i) => i.bookingId === r.id)
        .map((i) => ({ id: i.id, type: i.type, amount: i.amount, status: i.status, amountReceived: BigInt(i.received) })),
    };
    const mine = invs.filter((i) => i.bookingId === r.id);
    return {
      id: r.id,
      propertyId: r.propertyId,
      cleaningFeeOverrideRaw: r.cleaningFeeOverrideRaw,
      paidPenalties: mine.filter((i) => i.type === "penalty" && i.status === "paid").map((i) => ({ amount: BigInt(i.received), operatorRevenue: i.operatorRevenue })),
      externalRef: r.externalRef,
      channel: r.channel,
      guestName: r.guestName,
      propertyName: r.propertyName,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      settlementStatus: r.settlementStatus,
      recon: reconcileBooking(input, now),
    };
  });
}

/** Bookings an operator can charge against (newest stays first). */
export async function listBookingOptions(userId: string) {
  return (await db())
    .select({ id: bookings.id, guestName: bookings.guestName, externalRef: bookings.externalRef, propertyName: properties.name, checkIn: bookings.checkIn, checkOut: bookings.checkOut })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(eq(bookings.userId, userId))
    .orderBy(sql`${bookings.checkIn} desc`);
}
