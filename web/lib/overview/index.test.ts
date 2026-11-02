import { describe, expect, it } from "vitest";
import { type OverviewInput, attentionItems, overviewMetrics } from "./index";

const U = 1_000_000n;
const booking = (id: string, o: Partial<OverviewInput["bookings"][number]> = {}): OverviewInput["bookings"][number] => ({
  id,
  guestName: `Guest ${id}`,
  propertyName: "Casa Azul",
  settlementStatus: "ready",
  collected: 0n,
  penaltiesCollected: 0n,
  note: "",
  ...o,
});

const base: OverviewInput = { bookings: [], invoices: [], held: [], runs: [], readyToPay: 0n, readyCount: 0, today: "2026-11-10" };

describe("overviewMetrics", () => {
  it("is all zeros with no data", () => {
    expect(overviewMetrics(base)).toEqual({ collected: 0n, collectedBookings: 0, readyToPay: 0n, readyCount: 0, paidOut: 0n, paidRuns: 0, attention: 0 });
  });

  it("adds collected revenue and penalties, paid totals of finished runs, and counts what needs attention", () => {
    const m = overviewMetrics({
      ...base,
      bookings: [
        booking("a", { collected: 500n * U, penaltiesCollected: 50n * U, settlementStatus: "settled" }),
        booking("b", { collected: 300n * U, settlementStatus: "blocked", note: "Collected $300.00 vs expected $320.00" }),
        booking("c", { settlementStatus: "unreconciled" }),
      ],
      runs: [
        { id: "r1", status: "succeeded", paidTotalRaw: 700n * U, startedAt: new Date("2026-11-09T10:00:00Z"), txs: [] },
        { id: "r2", status: "partial", paidTotalRaw: 100n * U, startedAt: new Date("2026-11-09T11:00:00Z"), txs: [] },
        { id: "r3", status: "failed", paidTotalRaw: 0n, startedAt: new Date("2026-11-09T12:00:00Z"), txs: [] },
      ],
      held: [{ bookingId: "a", role: "owner", amountRaw: 900n * U, reason: "OverCap", guestName: "Guest a", payeeName: "Owen" }],
      invoices: [
        { publicId: "p1", status: "open", type: "penalty", amountRaw: 45n * U, dueDate: "2026-11-01", guestName: "Guest c", description: "Late checkout" },
        { publicId: "p2", status: "open", type: "penalty", amountRaw: 45n * U, dueDate: "2026-11-20", guestName: "Guest c", description: "Not due yet" },
        { publicId: "p3", status: "underpaid", type: "penalty", amountRaw: 45n * U, dueDate: "2026-11-20", guestName: "Guest c", description: "Short" },
      ],
      readyToPay: 250n * U,
      readyCount: 1,
    });
    expect(m).toEqual({
      collected: 850n * U,
      collectedBookings: 2,
      readyToPay: 250n * U,
      readyCount: 1,
      paidOut: 800n * U,
      paidRuns: 2,
      attention: 4, // 1 blocked booking + 1 held payout + 1 overdue invoice + 1 underpaid invoice
    });
  });
});

describe("attentionItems", () => {
  it("lists blocked bookings, held payouts and invoice problems with plain reasons and links, most urgent first", () => {
    const items = attentionItems({
      ...base,
      bookings: [booking("b", { settlementStatus: "blocked", note: "Open damage/penalty claim: $200.00 unpaid" })],
      held: [{ bookingId: "a", role: "owner", amountRaw: 900n * U, reason: "OverCap", guestName: "Diego", payeeName: "Owen" }],
      invoices: [{ publicId: "p1", status: "open", type: "penalty", amountRaw: 45n * U, dueDate: "2026-11-01", guestName: "Mia", description: "Late checkout" }],
    });
    expect(items).toEqual([
      { key: "booking-b", kind: "booking", title: "Guest b · Casa Azul", detail: "Open damage/penalty claim: $200.00 unpaid", href: "/bookings" },
      { key: "held-a-owner", kind: "payout", title: "Owen for Diego", detail: "Above this payee's per-payout limit · $900.00", href: "/payouts" },
      { key: "invoice-p1", kind: "invoice", title: "Mia · Late checkout", detail: "Overdue since Nov 1, 2026 · $45.00", href: "/invoices" },
    ]);
  });

  it("caps the list and says nothing when all is well", () => {
    expect(attentionItems(base)).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => booking(`b${i}`, { settlementStatus: "blocked", note: "x" }));
    expect(attentionItems({ ...base, bookings: many }, 6)).toHaveLength(6);
  });
});
