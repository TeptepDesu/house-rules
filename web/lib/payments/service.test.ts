import { describe, expect, it } from "vitest";
import { createMockOneClick } from "@/lib/intents/mock";
import { oneClickMode } from "@/lib/intents/provider";
import { pollPayment, startPayment } from "./service";

const U = 1_000_000n;
const NOW = new Date("2026-11-06T12:00:00Z");
const invoice = { id: "inv1", amountRaw: 200n * U, status: "open" as const };
const base = { vaultAccount: "vault.op.testnet", usdcAssetId: "nep141:usdc.mock", originAsset: "nep141:arb-usdc.mock", refundTo: "0xGuest" };

function deps(credit: (hashes: string[]) => bigint = () => 200n * U) {
  const oneClick = createMockOneClick();
  return { oneClick, verifyDelivery: async (h: string[]) => credit(h), now: () => NOW };
}

describe("oneClickMode", () => {
  it("mock by default outside production; live in production; never mock in production", () => {
    expect(oneClickMode({ NODE_ENV: "development" })).toBe("mock");
    expect(oneClickMode({ NODE_ENV: "development", ONECLICK_MODE: "live" })).toBe("live");
    expect(oneClickMode({ NODE_ENV: "production" })).toBe("live");
    expect(() => oneClickMode({ NODE_ENV: "production", ONECLICK_MODE: "mock" })).toThrow(/production/);
  });
});

describe("startPayment", () => {
  it("quotes EXACT_OUTPUT of the invoice amount to the vault and returns a deposit address + deadline", async () => {
    const d = deps();
    const r = await startPayment(d, { invoice, ...base });
    if (!r.ok) throw new Error(r.error);
    expect(r.depositAddress).toMatch(/^mock-/);
    expect(r.quoteRequest).toMatchObject({ swapType: "EXACT_OUTPUT", amount: "200000000", recipient: "vault.op.testnet", destinationAsset: "nep141:usdc.mock" });
    expect(r.deadline.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it.each(["paid", "waived", "refunded", "pending"] as const)("refuses a %s invoice", async (status) => {
    expect(await startPayment(deps(), { invoice: { ...invoice, status }, ...base })).toEqual({ ok: false, error: "not_payable" });
  });

  it("refuses when the operator has no vault yet", async () => {
    expect(await startPayment(deps(), { invoice, ...base, vaultAccount: null })).toEqual({ ok: false, error: "no_vault" });
  });
});

describe("pollPayment", () => {
  async function started() {
    const d = deps();
    const r = await startPayment(d, { invoice, ...base });
    if (!r.ok) throw new Error();
    return { d, addr: r.depositAddress, deadline: r.deadline };
  }

  it("waiting for deposit → open invoice", async () => {
    const { d, addr, deadline } = await started();
    expect(await pollPayment(d, { depositAddress: addr, deadline, invoiceAmount: invoice.amountRaw })).toMatchObject({
      paymentStatus: "awaiting_deposit",
      invoiceStatus: "open",
      amountReceived: 0n,
    });
  });

  it("guest pays → processing → SUCCESS verified on-chain → invoice paid", async () => {
    const { d, addr, deadline } = await started();
    d.oneClick.simulateDeposit(addr);
    const p1 = await pollPayment(d, { depositAddress: addr, deadline, invoiceAmount: invoice.amountRaw });
    expect(p1).toMatchObject({ paymentStatus: "processing", invoiceStatus: "pending" });
    const p2 = await pollPayment(d, { depositAddress: addr, deadline, invoiceAmount: invoice.amountRaw });
    expect(p2).toMatchObject({ paymentStatus: "verified", invoiceStatus: "paid", amountReceived: 200n * U });
    expect(p2.destinationTx).toMatch(/^mock-tx-/);
  });

  it("1Click says SUCCESS but nothing reached the vault on-chain → NOT paid", async () => {
    const d = deps(() => 0n);
    const r = await startPayment(d, { invoice, ...base });
    if (!r.ok) throw new Error();
    d.oneClick.simulateDeposit(r.depositAddress);
    await pollPayment(d, { depositAddress: r.depositAddress, deadline: r.deadline, invoiceAmount: invoice.amountRaw });
    const p = await pollPayment(d, { depositAddress: r.depositAddress, deadline: r.deadline, invoiceAmount: invoice.amountRaw });
    expect(p).toMatchObject({ paymentStatus: "delivered_unverified", invoiceStatus: "pending", amountReceived: 0n });
  });

  it("less than invoiced reached the vault → underpaid", async () => {
    const d = deps(() => 150n * U);
    const r = await startPayment(d, { invoice, ...base });
    if (!r.ok) throw new Error();
    d.oneClick.simulateDeposit(r.depositAddress);
    await pollPayment(d, { depositAddress: r.depositAddress, deadline: r.deadline, invoiceAmount: invoice.amountRaw });
    expect(await pollPayment(d, { depositAddress: r.depositAddress, deadline: r.deadline, invoiceAmount: invoice.amountRaw })).toMatchObject({
      paymentStatus: "verified",
      invoiceStatus: "underpaid",
      amountReceived: 150n * U,
    });
  });

  it("deadline passes with no deposit → expired", async () => {
    const { d, addr } = await started();
    expect(await pollPayment(d, { depositAddress: addr, deadline: new Date(NOW.getTime() - 1), invoiceAmount: invoice.amountRaw })).toMatchObject({
      paymentStatus: "expired",
      invoiceStatus: "expired",
    });
  });

  it("unknown deposit address → error, never paid", async () => {
    await expect(pollPayment(deps(), { depositAddress: "nope", deadline: NOW, invoiceAmount: 1n })).rejects.toThrow();
  });
});
