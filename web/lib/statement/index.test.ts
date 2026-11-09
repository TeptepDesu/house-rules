import { describe, expect, it } from "vitest";
import { type StatementRow, buildStatement, heldReason } from "./index";

const U = 1_000_000n;
const row = (o: Partial<StatementRow> & { splitId: string }): StatementRow => ({
  role: "owner",
  amountRaw: 5n * U,
  status: "paid",
  reason: null,
  propertyName: "Casa Azul",
  checkIn: "2026-11-01",
  checkOut: "2026-11-03",
  txHash: "9ZosEB4gxGGzfDUc5k8oy37Ah3sN7gdPQSwDt5BC2wFJ",
  ...o,
});

describe("buildStatement", () => {
  it("totals what was paid and what's held, separately", () => {
    const s = buildStatement([
      row({ splitId: "a", amountRaw: 6_737_500n }),
      row({ splitId: "b", amountRaw: 4_097_000n, checkOut: "2026-11-07" }),
      row({ splitId: "c", amountRaw: 7_395_000n, status: "rejected", reason: "OverCap", txHash: null }),
    ]);
    expect(s.paidRaw).toBe(10_834_500n);
    expect(s.heldRaw).toBe(7_395_000n);
    expect(s.lines).toHaveLength(3);
  });

  it("a paid line links its transaction; a rehearsal (simulated) hash doesn't get a link", () => {
    const s = buildStatement([row({ splitId: "real" }), row({ splitId: "sim", txHash: "mock-1a2b", checkOut: "2026-11-02" })]);
    expect(s.lines.find((l) => l.id === "real")).toMatchObject({ state: "paid", txHash: "9ZosEB4gxGGzfDUc5k8oy37Ah3sN7gdPQSwDt5BC2wFJ", simulated: false });
    expect(s.lines.find((l) => l.id === "sim")).toMatchObject({ state: "paid", txHash: null, simulated: true });
  });

  it("rejected, or pending with a reason, is held and says why in the payee's words", () => {
    const s = buildStatement([
      row({ splitId: "cap", status: "rejected", reason: "OverCap", txHash: null }),
      row({ splitId: "sib", status: "pending", reason: "SiblingRejected", txHash: null, checkOut: "2026-11-02" }),
    ]);
    expect(s.lines.find((l) => l.id === "cap")).toMatchObject({ state: "held", reasonText: "Above your per-payout limit" });
    expect(s.lines.find((l) => l.id === "sib")).toMatchObject({ state: "held", reasonText: "Held with the rest of this booking" });
  });

  it("a failure that will be retried (network, reverted batch, stopped run) is still being paid, not held", () => {
    for (const reason of ["other", "BatchReverted", "SettleFailed", "RunStopped"]) {
      const s = buildStatement([row({ splitId: "t", status: "pending", reason, txHash: null })]);
      expect(s.lines[0]).toMatchObject({ state: "processing", reasonText: "" });
      expect(s.heldRaw).toBe(0n);
    }
  });

  it("in rehearsal every paid line is marked simulated and never links, even one paid without a tx", () => {
    const s = buildStatement([row({ splitId: "a" }), row({ splitId: "b", txHash: null, checkOut: "2026-11-02" })], { rehearsal: true });
    for (const l of s.lines) expect(l).toMatchObject({ state: "paid", simulated: true, txHash: null });
  });

  it("pending with no reason is still being paid, and counts as neither paid nor held", () => {
    const s = buildStatement([row({ splitId: "p", status: "pending", reason: null, txHash: null })]);
    expect(s.lines[0]).toMatchObject({ state: "processing", reasonText: "" });
    expect(s.paidRaw).toBe(0n);
    expect(s.heldRaw).toBe(0n);
  });

  it("the operator's own share (retained) never appears on a payee's statement", () => {
    expect(buildStatement([row({ splitId: "r", status: "retained" })]).lines).toEqual([]);
  });

  it("newest stay first, then by property", () => {
    const s = buildStatement([
      row({ splitId: "old", checkOut: "2026-11-03" }),
      row({ splitId: "new-b", checkOut: "2026-11-07", propertyName: "Seaside Cottage" }),
      row({ splitId: "new-a", checkOut: "2026-11-07", propertyName: "Loft 21" }),
    ]);
    expect(s.lines.map((l) => l.id)).toEqual(["new-a", "new-b", "old"]);
  });

  it("empty statement: zero totals, no lines", () => {
    expect(buildStatement([])).toEqual({ lines: [], paidRaw: 0n, heldRaw: 0n });
  });
});

describe("heldReason", () => {
  it("speaks to the payee, not the operator", () => {
    expect(heldReason("OverCap")).toBe("Above your per-payout limit");
    expect(heldReason("PayeeInDelay")).toBe("Your account is in its new-payee waiting period");
    expect(heldReason("PayeeNotAllowed")).toBe("Your account isn't approved for payouts yet");
  });

  it("anything operational (balance, network, setup) is just 'held for review': no internals leak", () => {
    for (const code of ["InsufficientBalance", "allowance", "key_scope", "other", "no_owner_payee", "something-new", null]) {
      expect(heldReason(code)).toBe("Held for review by the operator");
    }
  });
});
