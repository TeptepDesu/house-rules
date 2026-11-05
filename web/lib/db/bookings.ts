import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { newDirectRef, newPublicId } from "@/lib/ids";
import type { ImportRow } from "@/lib/importers";
import { type BookingForRecon, type Reconciliation, reconcileBooking } from "@/lib/reconcile";
import { stayRange } from "@/lib/ui/format";
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
      acceptedCollectedRaw: bookings.acceptedCollectedRaw,
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
          dueDate: invoices.dueDate,
          operatorRevenue: invoices.operatorRevenue,
          received: sql<string>`coalesce(sum(case when ${payments.status} = 'verified' then ${payments.amountReceivedRaw} else 0 end), 0)`,
        })
        .from(invoices)
        .leftJoin(payments, eq(payments.invoiceId, invoices.id))
        .where(and(eq(invoices.userId, userId), inArray(invoices.bookingId, ids)))
        .groupBy(invoices.id)
    : [];

  return rows.map((r) => {
    // a direct stay is due when its invoice says; a channel booking has no invoice for the stay
    const stayInvoice = invs.find((i) => i.bookingId === r.id && i.type === "booking");
    const input: BookingForRecon = {
      id: r.id,
      collectionMode: r.collectionMode,
      expectedGross: r.expectedGrossRaw,
      otaPayout: r.otaPayoutRaw ?? undefined,
      dueDate: new Date(`${stayInvoice?.dueDate ?? r.checkOut}T23:59:59Z`),
      acceptedCollected: r.acceptedCollectedRaw ?? undefined,
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

/**
 * The operator accepts what was actually collected as final (e.g. after a channel's resolution
 * adjustment). Only for a booking that's currently a mismatch, and only for exactly the amount the
 * operator was shown: a different amount means the data changed under them.
 */
export async function acceptCollected(userId: string, bookingId: string, amountRaw: bigint): Promise<{ ok: true; delta: bigint } | { ok: false; error: "not_found" | "not_mismatch" | "amount_changed" }> {
  const row = (await listBookingsWithRecon(userId)).find((b) => b.id === bookingId);
  if (!row) return { ok: false, error: "not_found" };
  if (row.recon.result !== "mismatch") return { ok: false, error: "not_mismatch" };
  if (row.recon.collected !== amountRaw) return { ok: false, error: "amount_changed" };
  await (await db())
    .update(bookings)
    .set({ acceptedCollectedRaw: amountRaw })
    .where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId)));
  return { ok: true, delta: row.recon.delta };
}

/**
 * A direct booking (the guest books with the operator, not a channel): the booking and the
 * invoice for the stay are created together. Paid via the guest pay page (1Click → vault); it
 * reconciles once that payment is verified on-chain.
 */
export async function createDirectBooking(
  userId: string,
  i: { propertyId: string; guestName: string; checkIn: string; checkOut: string; totalRaw: bigint; dueDate: string },
): Promise<{ ok: true; id: string; externalRef: string; publicId: string } | { ok: false; error: "invalid_property" | "invalid_dates" }> {
  if (!(i.checkOut > i.checkIn)) return { ok: false, error: "invalid_dates" };
  const d = await db();
  const [prop] = await d.select({ id: properties.id, name: properties.name }).from(properties).where(and(eq(properties.id, i.propertyId), eq(properties.userId, userId)));
  if (!prop) return { ok: false, error: "invalid_property" };
  for (let attempt = 0; ; attempt++) {
    const externalRef = newDirectRef();
    try {
      return await d.transaction(async (tx) => {
        const [b] = await tx
          .insert(bookings)
          .values({ userId, propertyId: prop.id, externalRef, channel: "direct", collectionMode: "onchain", guestName: i.guestName, checkIn: i.checkIn, checkOut: i.checkOut, expectedGrossRaw: i.totalRaw, source: "direct" })
          .returning({ id: bookings.id });
        const [inv] = await tx
          .insert(invoices)
          .values({ userId, bookingId: b.id, publicId: newPublicId(), type: "booking", description: `Stay at ${prop.name}, ${stayRange(i.checkIn, i.checkOut)}`, amountRaw: i.totalRaw, dueDate: i.dueDate })
          .returning({ publicId: invoices.publicId });
        return { ok: true as const, id: b.id, externalRef, publicId: inv.publicId };
      });
    } catch (e) {
      // the (user, channel, ref) index caught a reference collision: try a fresh one
      if (attempt < 3 && /bookings_user_channel_ref_uq/.test(String((e as { cause?: unknown })?.cause ?? e))) continue;
      throw e;
    }
  }
}
