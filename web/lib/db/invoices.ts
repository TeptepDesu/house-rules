import "server-only";
import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import { newPublicId } from "@/lib/ids";
import type { PaymentStatus } from "@/lib/intents";
import type { InvoiceStatus } from "@/lib/reconcile";
import { db } from "./conn";
import { bookings, invoices, payments, properties, users } from "./schema";

// Invoices and guest payments. Operator queries are scoped by userId; the public pay page only
// ever looks invoices up by their unguessable publicId and gets a narrow, guest-safe view.

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function setVaultAccount(userId: string, vaultAccount: string) {
  await (await db()).update(users).set({ vaultAccount }).where(eq(users.id, userId));
}

export async function getVaultAccount(userId: string): Promise<string | null> {
  const [u] = await (await db()).select({ v: users.vaultAccount }).from(users).where(eq(users.id, userId));
  return u?.v ?? null;
}

export async function createChargeInvoice(
  userId: string,
  i: { bookingId: string; type: "penalty" | "extension"; description: string; amountRaw: bigint; operatorRevenue: boolean; dueDate: string },
): Promise<Result<{ id: string; publicId: string }>> {
  const d = await db();
  const [b] = await d.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.id, i.bookingId), eq(bookings.userId, userId)));
  if (!b) return { ok: false, error: "invalid_booking" };
  const [row] = await d
    .insert(invoices)
    .values({ userId, bookingId: i.bookingId, publicId: newPublicId(), type: i.type, description: i.description, amountRaw: i.amountRaw, operatorRevenue: i.type === "penalty" && i.operatorRevenue, dueDate: i.dueDate })
    .returning({ id: invoices.id, publicId: invoices.publicId });
  return { ok: true, ...row };
}

export async function listInvoices(userId: string) {
  return (await db())
    .select({
      id: invoices.id,
      publicId: invoices.publicId,
      type: invoices.type,
      description: invoices.description,
      amountRaw: invoices.amountRaw,
      status: invoices.status,
      dueDate: invoices.dueDate,
      paidAt: invoices.paidAt,
      guestName: bookings.guestName,
      externalRef: bookings.externalRef,
      propertyName: properties.name,
    })
    .from(invoices)
    .leftJoin(bookings, eq(bookings.id, invoices.bookingId))
    .leftJoin(properties, eq(properties.id, bookings.propertyId))
    .where(eq(invoices.userId, userId))
    .orderBy(desc(invoices.createdAt));
}

/** Guest-safe view for /pay/[publicId]. Internal ids stay server-side (never rendered). */
export async function getPublicInvoice(publicId: string) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(publicId)) return null;
  const [r] = await (await db())
    .select({
      id: invoices.id,
      publicId: invoices.publicId,
      type: invoices.type,
      description: invoices.description,
      amountRaw: invoices.amountRaw,
      status: invoices.status,
      dueDate: invoices.dueDate,
      paidAt: invoices.paidAt,
      businessName: users.name,
      vaultAccount: users.vaultAccount,
      propertyName: properties.name,
      guestName: bookings.guestName,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
    })
    .from(invoices)
    .innerJoin(users, eq(users.id, invoices.userId))
    .leftJoin(bookings, eq(bookings.id, invoices.bookingId))
    .leftJoin(properties, eq(properties.id, bookings.propertyId))
    .where(eq(invoices.publicId, publicId));
  return r ?? null;
}

const PAYABLE: InvoiceStatus[] = ["open", "expired"];

/**
 * Save a new deposit address for an invoice. Re-checks, under the invoice's row lock, that it's
 * still payable: false if it was waived or paid while the quote was being made (the guest is
 * then told it's no longer open, and the address is never shown).
 */
export async function recordPaymentStart(
  invoiceId: string,
  p: { depositAddress: string; depositMemo?: string; originAsset: string; quoteDeadline: Date; rawQuoteJson: unknown },
): Promise<boolean> {
  return (await db()).transaction(async (tx) => {
    const [inv] = await tx.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, invoiceId)).for("update");
    if (!inv || !PAYABLE.includes(inv.status)) return false;
    await tx.insert(payments).values({ invoiceId, ...p, rawQuoteJson: p.rawQuoteJson as object, status: "awaiting_deposit" });
    return true;
  });
}

const IN_FLIGHT: PaymentStatus[] = ["processing", "incomplete_deposit", "delivered_unverified"];

/**
 * The operator forgives an open charge (it stops blocking the booking). Refused while a guest's
 * payment could still land: a deposit address that hasn't expired, or a deposit being processed.
 */
export async function waiveInvoice(userId: string, publicId: string, now: Date): Promise<Result<{ id: string; amountRaw: bigint; description: string }>> {
  return (await db()).transaction(async (tx) => {
    const [inv] = await tx
      .select({ id: invoices.id, type: invoices.type, status: invoices.status, amountRaw: invoices.amountRaw, description: invoices.description })
      .from(invoices)
      .where(and(eq(invoices.publicId, publicId), eq(invoices.userId, userId)))
      .for("update");
    if (!inv) return { ok: false, error: "not_found" };
    // the stay itself: reconciliation still expects this money, so waiving it would block the booking
    if (inv.type === "booking") return { ok: false, error: "not_waivable" };
    const ps = await tx.select({ status: payments.status, deadline: payments.quoteDeadline }).from(payments).where(eq(payments.invoiceId, inv.id));
    if (ps.some((x) => IN_FLIGHT.includes(x.status) || (x.status === "awaiting_deposit" && x.deadline > now))) {
      return { ok: false, error: "payment_in_progress" };
    }
    if (!PAYABLE.includes(inv.status)) return { ok: false, error: "not_open" };
    await tx.update(invoices).set({ status: "waived" }).where(eq(invoices.id, inv.id));
    return { ok: true, id: inv.id, amountRaw: inv.amountRaw, description: inv.description };
  });
}

const UNFINISHED: PaymentStatus[] = ["awaiting_deposit", ...IN_FLIGHT];

/**
 * Payments still worth asking 1Click about. One invoice: all of them. Otherwise the newest few that
 * aren't long dead; each check moves a row to a final status, so the list drains itself.
 */
export async function paymentsToSync(userId: string, o: { publicId?: string; deadlineAfter: Date; limit: number }) {
  const scope = o.publicId ? eq(invoices.publicId, o.publicId) : or(gt(payments.quoteDeadline, o.deadlineAfter), inArray(payments.status, IN_FLIGHT));
  return (await db())
    .select({
      id: payments.id,
      invoiceId: payments.invoiceId,
      depositAddress: payments.depositAddress,
      depositMemo: payments.depositMemo,
      deadline: payments.quoteDeadline,
      invoiceAmount: invoices.amountRaw,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(and(eq(invoices.userId, userId), inArray(payments.status, UNFINISHED), scope))
    .orderBy(desc(payments.quoteDeadline))
    .limit(o.limit);
}

/** The payment for this invoice + deposit address (a guest can't poll someone else's address). */
export async function findPayment(invoiceId: string, depositAddress: string) {
  const [p] = await (await db())
    .select()
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), eq(payments.depositAddress, depositAddress)));
  return p ?? null;
}

/** Persist a poll result; moves the invoice status in the same transaction. */
export async function applyPaymentUpdate(
  invoiceId: string,
  paymentId: string,
  u: { paymentStatus: PaymentStatus; invoiceStatus: InvoiceStatus; amountReceived: bigint; destinationTx?: string; originTx?: string; raw: unknown },
) {
  const now = new Date();
  await (await db()).transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        status: u.paymentStatus,
        amountReceivedRaw: u.amountReceived,
        destinationTx: u.destinationTx ?? null,
        originTx: u.originTx ?? null,
        rawStatusJson: u.raw as object,
        verifiedAt: u.paymentStatus === "verified" ? now : null,
      })
      .where(eq(payments.id, paymentId));
    // only move forward: a verified payment's invoice never goes back to open/pending
    const [inv] = await tx.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, invoiceId));
    // ...except that money which really arrived beats a waiver: it has to be counted
    const settled: InvoiceStatus[] = ["paid", "underpaid", "overpaid", "refunded", ...(u.paymentStatus === "verified" ? [] : ["waived" as const])];
    if (inv && !settled.includes(inv.status)) {
      await tx
        .update(invoices)
        .set({ status: u.invoiceStatus, paidAt: u.invoiceStatus === "paid" || u.invoiceStatus === "overpaid" || u.invoiceStatus === "underpaid" ? now : null })
        .where(eq(invoices.id, invoiceId));
    }
  });
}

/** The booking's still-payable invoices (newest first), for follow-up messages. Operator-scoped. */
export async function openInvoicesForBooking(userId: string, bookingId: string) {
  return (await db())
    .select({ publicId: invoices.publicId, type: invoices.type, amountRaw: invoices.amountRaw, description: invoices.description })
    .from(invoices)
    .where(and(eq(invoices.userId, userId), eq(invoices.bookingId, bookingId), inArray(invoices.status, ["open", "expired"])))
    .orderBy(desc(invoices.createdAt));
}
