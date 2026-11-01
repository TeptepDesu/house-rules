// Pure: turn ready bookings into vault payout items (plan §6E step 1). Amounts and payees come only
// from the operator's own data and lib/splits; an LLM never decides who is paid or how much.

import { type PayoutItem, type Split, payoutItems, splitBooking } from "@/lib/splits";

export type ReadyBooking = {
  id: string;
  propertyId: string;
  /** Revenue collected for the booking (reconciliation's `collected`). */
  collected: bigint;
  cleaningFeeOverride?: bigint | null;
  /** Paid penalty invoices for this booking. */
  penalties: { amount: bigint; operatorRevenue: boolean }[];
};

export type PropertyTerms = {
  id: string;
  cleaningFeeRaw: bigint;
  mgmtFeeBps: number;
  ownerAccount: string | null;
  cleanerAccount: string | null;
};

export type BookingPlan = {
  bookingId: string;
  split: Split;
  items: PayoutItem[];
  problem?: "no_property" | "no_owner_payee" | "no_cleaner_payee";
};

export function planBookingPayouts(bookings: ReadyBooking[], properties: PropertyTerms[]): BookingPlan[] {
  const props = new Map(properties.map((p) => [p.id, p]));
  return bookings.map((b) => {
    const p = props.get(b.propertyId);
    const empty = { cleaner: 0n, manager: 0n, owner: 0n };
    if (!p) return { bookingId: b.id, split: empty, items: [], problem: "no_property" };
    const split = splitBooking({
      collected: b.collected,
      cleaningFee: b.cleaningFeeOverride ?? p.cleaningFeeRaw,
      mgmtFeeBps: p.mgmtFeeBps,
      penalties: b.penalties,
    });
    if (split.owner > 0n && !p.ownerAccount) return { bookingId: b.id, split, items: [], problem: "no_owner_payee" };
    if (split.cleaner > 0n && !p.cleanerAccount) return { bookingId: b.id, split, items: [], problem: "no_cleaner_payee" };
    const items = payoutItems(b.id, split, { owner: p.ownerAccount ?? "", cleaner: p.cleanerAccount ?? "" });
    return { bookingId: b.id, split, items };
  });
}
