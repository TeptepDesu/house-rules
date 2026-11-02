// Pure reconciliation (plan §6A). No I/O. Evaluated in this order; first match wins:
//   1. open_penalty  unpaid, non-waived penalty invoice            → blocked
//   2. mismatch      collected ≠ expected (something was collected) → blocked, delta stored
//                    (unless the operator accepted exactly that collected amount as final → matched)
//   3. unpaid        on-chain booking past due, nothing collected   → blocked
//   4. matched                                                      → ready
// Plus awaiting_payment (not due yet / OTA report not imported)     → stays unreconciled.
// orphan payments (verified, no booking) are listed separately: findOrphanPayments.

import { formatUsd } from "@/lib/money";
import { longDate } from "@/lib/ui/format";

export type InvoiceType = "booking" | "extension" | "penalty" | "deposit";
export type InvoiceStatus = "open" | "pending" | "paid" | "underpaid" | "overpaid" | "expired" | "refunded" | "waived";

export type InvoiceForRecon = {
  id: string;
  type: InvoiceType;
  amount: bigint;
  status: InvoiceStatus;
  /** Verified amount actually received for this invoice (0 if none). */
  amountReceived: bigint;
};

export type BookingForRecon = {
  id: string;
  collectionMode: "onchain" | "ota_payout";
  /** On-chain: gross the guest owes. OTA: net payout expected from the channel. */
  expectedGross: bigint;
  /** OTA only: payout from the imported report, if imported. */
  otaPayout?: bigint;
  dueDate: Date;
  invoices: InvoiceForRecon[];
  /** The operator accepted exactly this collected amount as final (resolves a mismatch). */
  acceptedCollected?: bigint;
};

export type ReconResult = "matched" | "mismatch" | "open_penalty" | "unpaid" | "awaiting_payment";

export type Reconciliation = {
  bookingId: string;
  result: ReconResult;
  settlementStatus: "ready" | "blocked" | "unreconciled";
  /** Revenue collected for the booking (excludes deposits and penalties). */
  collected: bigint;
  /** collected − expected. Negative = short. */
  delta: bigint;
  /** Paid penalty proceeds, split separately (owner unless operator revenue). */
  penaltiesCollected: bigint;
  note: string;
};

const COUNTS_AS_RECEIVED: InvoiceStatus[] = ["paid", "underpaid", "overpaid"];
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

export function reconcileBooking(b: BookingForRecon, now: Date): Reconciliation {
  const penalties = b.invoices.filter((i) => i.type === "penalty");
  const openPenalties = penalties.filter((i) => i.status !== "paid" && i.status !== "waived" && i.status !== "refunded");
  const penaltiesCollected = sum(penalties.filter((i) => i.status === "paid").map((i) => i.amountReceived));

  let expected: bigint;
  let collected: bigint;
  let haveCollection: boolean;
  if (b.collectionMode === "ota_payout") {
    expected = b.expectedGross;
    collected = b.otaPayout ?? 0n;
    haveCollection = b.otaPayout !== undefined;
  } else {
    const revenue = b.invoices.filter((i) => i.type === "booking" || i.type === "extension");
    const extensions = revenue.filter((i) => i.type === "extension" && i.status !== "waived");
    expected = b.expectedGross + sum(extensions.map((i) => i.amount));
    collected = sum(revenue.filter((i) => COUNTS_AS_RECEIVED.includes(i.status)).map((i) => i.amountReceived));
    haveCollection = collected > 0n;
  }
  const delta = collected - expected;
  const base = { bookingId: b.id, collected, delta, penaltiesCollected };

  if (openPenalties.length > 0) {
    const owed = sum(openPenalties.map((i) => i.amount));
    return { ...base, result: "open_penalty", settlementStatus: "blocked", note: `Open damage/penalty claim: ${formatUsd(owed)} unpaid` };
  }
  if (haveCollection && delta !== 0n) {
    const how = delta < 0n ? `${formatUsd(-delta)} short` : `${formatUsd(delta)} over`;
    // accepted as final: only for exactly the amount the operator saw (a new amount re-blocks)
    if (b.acceptedCollected === collected) {
      return { ...base, result: "matched", settlementStatus: "ready", note: `Accepted ${formatUsd(collected)} as final (${how} of ${formatUsd(expected)})` };
    }
    return { ...base, result: "mismatch", settlementStatus: "blocked", note: `Collected ${formatUsd(collected)} vs expected ${formatUsd(expected)} (${how})` };
  }
  if (!haveCollection) {
    if (b.collectionMode === "onchain" && now > b.dueDate) {
      return { ...base, result: "unpaid", settlementStatus: "blocked", note: `Nothing collected; due ${longDate(b.dueDate.toISOString().slice(0, 10))}` };
    }
    const why = b.collectionMode === "ota_payout" ? "Waiting for the channel's payout report" : "Not due yet";
    return { ...base, result: "awaiting_payment", settlementStatus: "unreconciled", note: why };
  }
  return { ...base, result: "matched", settlementStatus: "ready", note: `Collected ${formatUsd(collected)}` };
}

export type PaymentForRecon = { id: string; invoiceId: string; verified: boolean; amountReceived: bigint };

/** Verified payments whose invoice isn't attached to any booking (invoiceId → bookingId|null). */
export function findOrphanPayments(payments: PaymentForRecon[], invoiceBooking: Map<string, string | null>): PaymentForRecon[] {
  return payments.filter((p) => p.verified && !invoiceBooking.get(p.invoiceId));
}
