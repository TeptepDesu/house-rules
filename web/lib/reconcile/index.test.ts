import { describe, expect, it } from "vitest";
import { type BookingForRecon, type InvoiceForRecon, findOrphanPayments, reconcileBooking } from "./index";

const U = 1_000_000n;
const NOW = new Date("2026-11-06T12:00:00Z");

const direct = (over: Partial<BookingForRecon> = {}): BookingForRecon => ({
  id: "bk1",
  collectionMode: "onchain",
  expectedGross: 1_000n * U,
  dueDate: new Date("2026-11-05T00:00:00Z"),
  invoices: [],
  ...over,
});
const inv = (type: InvoiceForRecon["type"], amount: bigint, status: InvoiceForRecon["status"], received = status === "paid" ? amount : 0n): InvoiceForRecon => ({
  id: `${type}-${amount}`,
  type,
  amount,
  status,
  amountReceived: received,
});

describe("reconcileBooking: on-chain (direct) bookings", () => {
  it("matched → ready: collected exactly the expected gross", () => {
    const r = reconcileBooking(direct({ invoices: [inv("booking", 1_000n * U, "paid")] }), NOW);
    expect(r).toMatchObject({ result: "matched", settlementStatus: "ready", collected: 1_000n * U, delta: 0n });
  });

  it("extensions add to what's expected and what's collected", () => {
    const r = reconcileBooking(direct({ invoices: [inv("booking", 1_000n * U, "paid"), inv("extension", 150n * U, "paid")] }), NOW);
    expect(r).toMatchObject({ result: "matched", collected: 1_150n * U });
  });

  it("mismatch → blocked: underpaid by $40, delta is negative", () => {
    const r = reconcileBooking(direct({ invoices: [inv("booking", 1_000n * U, "underpaid", 960n * U)] }), NOW);
    expect(r).toMatchObject({ result: "mismatch", settlementStatus: "blocked", delta: -40n * U });
    expect(r.note).toMatch(/\$40\.00 short/);
  });

  it("mismatch → blocked: overpaid is also a mismatch (refund or adjust first)", () => {
    const r = reconcileBooking(direct({ invoices: [inv("booking", 1_000n * U, "overpaid", 1_010n * U)] }), NOW);
    expect(r).toMatchObject({ result: "mismatch", delta: 10n * U });
    expect(r.note).toMatch(/\$10\.00 over/);
  });

  it("unpaid → blocked: past due with nothing collected", () => {
    const r = reconcileBooking(direct({ invoices: [inv("booking", 1_000n * U, "open")] }), NOW);
    expect(r).toMatchObject({ result: "unpaid", settlementStatus: "blocked", collected: 0n });
  });

  it("not yet due with nothing collected → awaiting payment, not blocked", () => {
    const r = reconcileBooking(direct({ dueDate: new Date("2026-11-20T00:00:00Z"), invoices: [inv("booking", 1_000n * U, "open")] }), NOW);
    expect(r).toMatchObject({ result: "awaiting_payment", settlementStatus: "unreconciled" });
  });

  it("security deposits are not revenue and don't count toward collected", () => {
    const r = reconcileBooking(direct({ invoices: [inv("booking", 1_000n * U, "paid"), inv("deposit", 300n * U, "paid")] }), NOW);
    expect(r).toMatchObject({ result: "matched", collected: 1_000n * U });
  });
});

describe("reconcileBooking: penalties", () => {
  it("open_penalty → blocked, even if the booking itself is fully paid", () => {
    const r = reconcileBooking(direct({ invoices: [inv("booking", 1_000n * U, "paid"), inv("penalty", 200n * U, "open")] }), NOW);
    expect(r).toMatchObject({ result: "open_penalty", settlementStatus: "blocked" });
    expect(r.note).toMatch(/\$200\.00/);
  });

  it("a pending (in-flight) penalty still blocks", () => {
    expect(reconcileBooking(direct({ invoices: [inv("booking", 1_000n * U, "paid"), inv("penalty", 200n * U, "pending")] }), NOW).result).toBe("open_penalty");
  });

  it("paid or waived penalties don't block, and paid ones are reported for the split", () => {
    const r = reconcileBooking(
      direct({ invoices: [inv("booking", 1_000n * U, "paid"), inv("penalty", 200n * U, "paid"), inv("penalty", 50n * U, "waived")] }),
      NOW,
    );
    expect(r).toMatchObject({ result: "matched", collected: 1_000n * U, penaltiesCollected: 200n * U });
  });

  it("evaluation order: open penalty wins over mismatch and unpaid", () => {
    const r = reconcileBooking(direct({ invoices: [inv("booking", 1_000n * U, "underpaid", 1n), inv("penalty", 5n * U, "open")] }), NOW);
    expect(r.result).toBe("open_penalty");
    const r2 = reconcileBooking(direct({ invoices: [inv("booking", 1_000n * U, "open"), inv("penalty", 5n * U, "open")] }), NOW);
    expect(r2.result).toBe("open_penalty");
  });

  it("evaluation order: mismatch wins over unpaid", () => {
    expect(reconcileBooking(direct({ invoices: [inv("booking", 1_000n * U, "underpaid", 1n)] }), NOW).result).toBe("mismatch");
  });
});

describe("reconcileBooking: OTA bookings (payout report)", () => {
  const ota = (over: Partial<BookingForRecon> = {}) => direct({ collectionMode: "ota_payout", expectedGross: 870n * U, ...over });

  it("matched when the report's payout equals the expected net", () => {
    expect(reconcileBooking(ota({ otaPayout: 870n * U }), NOW)).toMatchObject({ result: "matched", settlementStatus: "ready", collected: 870n * U });
  });

  it("mismatch when the OTA paid out a different amount", () => {
    expect(reconcileBooking(ota({ otaPayout: 850n * U }), NOW)).toMatchObject({ result: "mismatch", delta: -20n * U });
  });

  it("no report yet → awaiting payment (OTA bookings are never 'unpaid')", () => {
    expect(reconcileBooking(ota({ otaPayout: undefined }), NOW)).toMatchObject({ result: "awaiting_payment", settlementStatus: "unreconciled" });
  });

  it("open penalty still blocks an OTA booking", () => {
    expect(reconcileBooking(ota({ otaPayout: 870n * U, invoices: [inv("penalty", 75n * U, "open")] }), NOW).result).toBe("open_penalty");
  });
});

describe("reconcileBooking: the operator accepts a short or over payout as final", () => {
  const ota = (over: Partial<BookingForRecon> = {}) => direct({ collectionMode: "ota_payout", expectedGross: 494_700_000n, otaPayout: 474_700_000n, ...over });

  it("accepting exactly what was collected → matched; the split uses what actually arrived", () => {
    const r = reconcileBooking(ota({ acceptedCollected: 474_700_000n }), NOW);
    expect(r).toMatchObject({ result: "matched", settlementStatus: "ready", collected: 474_700_000n, delta: -20n * U });
    expect(r.note).toBe("Accepted $474.70 as final ($20.00 short of $494.70)");
  });

  it("the acceptance is tied to that exact amount: a different payout later is a mismatch again", () => {
    expect(reconcileBooking(ota({ otaPayout: 470n * U, acceptedCollected: 474_700_000n }), NOW)).toMatchObject({ result: "mismatch", settlementStatus: "blocked" });
  });

  it("an open penalty still blocks, accepted or not; on-chain underpayments can be accepted too", () => {
    expect(reconcileBooking(ota({ acceptedCollected: 474_700_000n, invoices: [inv("penalty", 50n * U, "open")] }), NOW).result).toBe("open_penalty");
    const under = direct({ invoices: [inv("booking", 1_000n * U, "underpaid", 960n * U)], acceptedCollected: 960n * U });
    expect(reconcileBooking(under, NOW)).toMatchObject({ result: "matched", collected: 960n * U });
  });
});

describe("findOrphanPayments", () => {
  it("lists verified payments whose invoice has no booking", () => {
    const orphans = findOrphanPayments(
      [
        { id: "p1", invoiceId: "i1", verified: true, amountReceived: 5n },
        { id: "p2", invoiceId: "i2", verified: true, amountReceived: 7n },
        { id: "p3", invoiceId: "i3", verified: false, amountReceived: 9n },
      ],
      new Map([
        ["i1", "bk1"],
        ["i2", null],
        ["i3", null],
      ]),
    );
    expect(orphans.map((p) => p.id)).toEqual(["p2"]);
  });
});
