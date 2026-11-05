import { AccessKeyNotEnoughAllowanceActionError, AccessKeyMethodNameMismatchActionError } from "near-api-js/rpc-errors";
import { KeyPair } from "near-api-js";
import { describe, expect, it } from "vitest";
import type { VaultPayee } from "@/lib/near/policy";
import type { SettleResult } from "@/lib/near/outcome";
import type { PayoutItem } from "@/lib/splits";
import { type BookingPlan, planBookingPayouts } from "./plan";
import { type AgentVault, runAgent } from "./run";

const U = 1_000_000n;
const HOUR = 3_600_000_000_000n;
const payees: VaultPayee[] = [
  { accountId: "owen.testnet", role: "owner", capPerPayout: 800n * U, payableFromNs: 0n, active: true },
  { accountId: "maria.testnet", role: "cleaner", capPerPayout: 100n * U, payableFromNs: 0n, active: true },
];
const casa = { id: "p1", cleaningFeeRaw: 80n * U, mgmtFeeBps: 1500, ownerAccount: "owen.testnet", cleanerAccount: "maria.testnet" };
const plansFor = (n: number, collected = 500n * U): BookingPlan[] =>
  planBookingPayouts(
    Array.from({ length: n }, (_, i) => ({ id: `bk${String(i).padStart(2, "0")}`, propertyId: "p1", collected, penalties: [] })),
    [casa],
  );

function fakeVault(opts: { paid?: string[]; remaining?: bigint; balance?: bigint; settle?: (items: PayoutItem[], call: number) => SettleResult | Error } = {}) {
  const calls: { items: PayoutItem[]; gas: number }[] = [];
  const paid = new Set(opts.paid ?? []);
  const v: AgentVault = {
    getPayees: async () => payees,
    remainingToday: async () => opts.remaining ?? 100_000n * U,
    balance: async () => opts.balance ?? 100_000n * U,
    paidKeys: async (keys) => new Set(keys.filter((k) => paid.has(k))),
    settle: async (items, gas) => {
      calls.push({ items, gas });
      const r = opts.settle?.(items, calls.length) ?? { kind: "paid", keys: items.map((i) => i.key), total: items.reduce((a, i) => a + i.amount, 0n), txHash: `tx${calls.length}` };
      if (r instanceof Error) throw r;
      if (r.kind === "paid") r.keys.forEach((k) => paid.add(k));
      return r;
    },
  };
  return { v, calls };
}
const deps = (v: AgentVault) => ({ vault: v, nowNs: () => 2n * HOUR });

describe("runAgent", () => {
  it("pays ready bookings in one chunk; manager share retained; run succeeded", async () => {
    const { v, calls } = fakeVault();
    const r = await runAgent(deps(v), plansFor(2));
    expect(calls).toHaveLength(1);
    expect(calls[0].gas).toBe(45 + 6 * 4);
    expect(r.status).toBe("succeeded");
    expect(r.paidTotal).toBe(2n * (80n + 357n) * U); // cleaner 80 + owner 357 (net 420, mgmt 63)
    expect(r.bookings.every((b) => b.status === "paid")).toBe(true);
    expect(r.bookings[0].items.find((i) => i.role === "owner")).toMatchObject({ status: "paid", txHash: "tx1" });
  });

  it("chunks at 40 items without splitting a booking", async () => {
    const { v, calls } = fakeVault();
    const r = await runAgent(deps(v), plansFor(25)); // 50 items
    expect(calls.map((c) => c.items.length)).toEqual([40, 10]);
    expect(r.status).toBe("succeeded");
  });

  it("keys already paid on-chain count as paid (recovery after a crash), and aren't sent again", async () => {
    const { v, calls } = fakeVault({ paid: ["bk00:owner", "bk00:cleaner"] });
    const r = await runAgent(deps(v), plansFor(2));
    expect(calls[0].items.map((i) => i.key)).toEqual(["bk01:owner", "bk01:cleaner"]);
    expect(r.bookings.find((b) => b.bookingId === "bk00")).toMatchObject({ status: "paid" });
  });

  it("pre-check rejections stay pending with a reason and are never sent", async () => {
    const { v, calls } = fakeVault({ remaining: 500n * U }); // room for one booking (437) only
    const r = await runAgent(deps(v), plansFor(2));
    expect(calls).toHaveLength(1);
    const held = r.bookings.find((b) => b.bookingId === "bk01")!;
    expect(held).toMatchObject({ status: "pending" });
    expect(held.items.every((i) => i.reason === "DailyLimitExceeded")).toBe(true);
    expect(r.status).toBe("partial");
    expect(r.rejectedCount).toBe(2);
  });

  it("everything held by the pre-check → held, not failed: nothing was sent, so nothing went wrong", async () => {
    const { v, calls } = fakeVault({ remaining: 0n });
    const r = await runAgent(deps(v), plansFor(2));
    expect(calls).toHaveLength(0);
    expect(r.status).toBe("held");
    expect(r.paidTotal).toBe(0n);
    expect(r.rejectedCount).toBe(4);
    expect(r.bookings.every((b) => b.status === "pending")).toBe(true);
  });

  it("the rest held after an earlier run paid part of it → partial, not held", async () => {
    const { v, calls } = fakeVault({ remaining: 0n, paid: ["bk00:owner"] });
    const r = await runAgent(deps(v), plansFor(1));
    expect(calls).toHaveLength(0);
    expect(r.status).toBe("partial");
  });

  it("a reverted batch pays nothing: its bookings stay pending with the reason", async () => {
    const { v } = fakeVault({ settle: (items) => ({ kind: "reverted", keys: items.map((i) => i.key), total: 0n, txHash: "txR" }) });
    const r = await runAgent(deps(v), plansFor(1));
    expect(r.paidTotal).toBe(0n);
    expect(r.bookings[0]).toMatchObject({ status: "pending" });
    expect(r.bookings[0].items[0]).toMatchObject({ status: "pending", reason: "BatchReverted", txHash: "txR" });
    expect(r.status).toBe("failed");
  });

  it("an on-chain policy rejection is recorded with its code", async () => {
    const { v } = fakeVault({ settle: () => ({ kind: "rejected", code: "PayeeInDelay", txHash: "txP" }) });
    const r = await runAgent(deps(v), plansFor(1));
    expect(r.bookings[0].items[0]).toMatchObject({ status: "rejected", reason: "PayeeInDelay" });
  });

  it("a key-scope or allowance error stops the run immediately (no further chunks)", async () => {
    const pk = KeyPair.fromRandom("ed25519").getPublicKey();
    for (const err of [new AccessKeyMethodNameMismatchActionError("withdraw", null, "", ""), new AccessKeyNotEnoughAllowanceActionError("agent", 1n, 2n, pk, null, "", "")]) {
      const { v, calls } = fakeVault({ settle: () => err });
      const r = await runAgent(deps(v), plansFor(25));
      expect(calls).toHaveLength(1);
      expect(r.status).toBe("failed");
      expect(r.stoppedBecause?.kind).toMatch(/key_scope|allowance/);
    }
  });

  it("bookings with a setup problem are reported, not sent", async () => {
    const plans = planBookingPayouts([{ id: "x", propertyId: "p1", collected: 100n * U, penalties: [] }], [{ ...casa, ownerAccount: null }]);
    const { v, calls } = fakeVault();
    const r = await runAgent(deps(v), plans);
    expect(calls).toHaveLength(0);
    expect(r.bookings[0]).toMatchObject({ status: "blocked", reason: "no_owner_payee" });
  });

  it("nothing to pay → succeeded with zero totals, no transactions", async () => {
    const { v, calls } = fakeVault();
    const r = await runAgent(deps(v), []);
    expect(calls).toHaveLength(0);
    expect(r).toMatchObject({ status: "succeeded", plannedTotal: 0n, paidTotal: 0n });
  });
});
