import { describe, expect, it } from "vitest";
import { type OverviewInput, attentionItems, barPermille, overviewMetrics, weeklyCollected } from "./index";

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

describe("weeklyCollected", () => {
  const row = (checkIn: string, collected: bigint, penaltiesCollected = 0n) => ({ checkIn, collected, penaltiesCollected });

  it("is empty when nothing was collected", () => {
    expect(weeklyCollected([])).toEqual([]);
    expect(weeklyCollected([row("2026-10-05", 0n)])).toEqual([]);
  });

  it("buckets by the Monday of the stay's check-in week, in bigint, revenue plus penalties", () => {
    const w = weeklyCollected([row("2026-10-05", 100n * U), row("2026-10-11", 50n * U, 5n * U), row("2026-10-12", 20n * U)]);
    expect(w).toEqual([
      { weekStart: "2026-10-05", collected: 155n * U, bookings: 2 },
      { weekStart: "2026-10-12", collected: 20n * U, bookings: 1 },
    ]);
  });

  it("keeps a quiet week between busy ones, so the gap stays visible", () => {
    const w = weeklyCollected([row("2026-10-05", 10n * U), row("2026-10-19", 10n * U)]);
    expect(w.map((x) => x.collected)).toEqual([10n * U, 0n, 10n * U]);
    expect(w.map((x) => x.weekStart)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  });

  it("shows at most the latest N weeks of data, whatever today's date is", () => {
    const w = weeklyCollected([row("2026-01-05", 1n * U), row("2026-10-05", 1n * U), row("2026-10-12", 1n * U), row("2026-10-19", 1n * U)], 2);
    expect(w.map((x) => x.weekStart)).toEqual(["2026-10-12", "2026-10-19"]);
  });

  it("adds up exactly to the Collected metric when every stay is in the window", () => {
    const rows = [row("2026-10-01", 123_456_789n, 1n), row("2026-10-09", 7n), row("2026-10-20", 999_999_999_999n, 3n)];
    const total = weeklyCollected(rows).reduce((a, x) => a + x.collected, 0n);
    const m = overviewMetrics({ ...base, bookings: rows.map((r, i) => booking(String(i), r)) });
    expect(total).toBe(m.collected);
  });
});

describe("barPermille", () => {
  it("scales in integers: never float math on money", () => {
    expect(barPermille(1n, 3n)).toBe(333);
    expect(barPermille(3n, 3n)).toBe(1000);
    expect(barPermille(0n, 3n)).toBe(0);
    expect(barPermille(0n, 0n)).toBe(0);
  });

  it("keeps full precision past Number.MAX_SAFE_INTEGER", () => {
    const huge = 2n ** 80n;
    expect(barPermille(huge / 2n, huge)).toBe(500);
  });
});
