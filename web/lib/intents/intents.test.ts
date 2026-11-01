import { describe, expect, it, vi } from "vitest";
import success from "@/test/fixtures/rpc/settle-success.json";
import batchFailed from "@/test/fixtures/rpc/settle-batch-failed.json";
import type { TxOutcome } from "@/lib/near/outcome";
import { OneClickError, createOneClickClient } from "./client";
import { buildInvoiceQuote, invoiceStatusFromPayment, mapStatus, usdcCreditedTo } from "./index";

const U = 1_000_000n;
const USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

describe("buildInvoiceQuote", () => {
  it("asks for EXACT_OUTPUT of the invoice amount, delivered to the vault on NEAR", () => {
    const q = buildInvoiceQuote({
      amount: 125n * U,
      originAsset: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
      destinationAsset: USDC,
      vaultAccount: "vault.houserules-operator.near",
      refundTo: "0xGuestRefundAddress",
      deadline: new Date("2026-11-06T13:00:00Z"),
    });
    expect(q).toEqual({
      dry: false,
      swapType: "EXACT_OUTPUT",
      slippageTolerance: 100,
      originAsset: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
      depositType: "ORIGIN_CHAIN",
      destinationAsset: USDC,
      amount: "125000000",
      refundTo: "0xGuestRefundAddress",
      refundType: "ORIGIN_CHAIN",
      recipient: "vault.houserules-operator.near",
      recipientType: "DESTINATION_CHAIN",
      deadline: "2026-11-06T13:00:00.000Z",
    });
  });
  it("dry quotes for price previews", () => {
    expect(buildInvoiceQuote({ amount: 1n, originAsset: "a", destinationAsset: "b", vaultAccount: "v", refundTo: "r", deadline: new Date(0), dry: true }).dry).toBe(true);
  });
  it("rejects zero or negative amounts", () => {
    expect(() => buildInvoiceQuote({ amount: 0n, originAsset: "a", destinationAsset: "b", vaultAccount: "v", refundTo: "r", deadline: new Date(0) })).toThrow();
  });
});

describe("mapStatus (1Click /v0/status → payment status)", () => {
  const deadline = new Date("2026-11-06T13:00:00Z");
  it.each([
    ["PENDING_DEPOSIT", "awaiting_deposit"],
    ["KNOWN_DEPOSIT_TX", "processing"],
    ["PROCESSING", "processing"],
    ["INCOMPLETE_DEPOSIT", "incomplete_deposit"],
    ["SUCCESS", "delivered_unverified"],
    ["REFUNDED", "refunded"],
    ["FAILED", "failed"],
  ] as const)("%s → %s", (s, out) => {
    expect(mapStatus(s, { deadline, now: new Date("2026-11-06T12:00:00Z") })).toBe(out);
  });
  it("PENDING_DEPOSIT after the deadline → expired", () => {
    expect(mapStatus("PENDING_DEPOSIT", { deadline, now: new Date("2026-11-06T13:00:01Z") })).toBe("expired");
  });
  it("unknown statuses never count as paid", () => {
    expect(mapStatus("SOMETHING_NEW" as never, { deadline, now: deadline })).toBe("processing");
  });
});

describe("usdcCreditedTo (on-chain proof of delivery)", () => {
  const TOKEN = "usdc.test.near";
  it("sums ft_transfer events to the recipient from successful token receipts", () => {
    expect(usdcCreditedTo(success as unknown as TxOutcome, TOKEN, "owen.test.near")).toBe(300n * U);
    expect(usdcCreditedTo(success as unknown as TxOutcome, TOKEN, "maria.test.near")).toBe(50n * U);
  });
  it("ignores ft_transfer logs on a reverted receipt (spike #1 trap)", () => {
    expect(usdcCreditedTo(batchFailed as unknown as TxOutcome, TOKEN, "owen.test.near")).toBe(0n);
  });
  it("ignores lookalike tokens", () => {
    expect(usdcCreditedTo(success as unknown as TxOutcome, "fake-usdc.test.near", "owen.test.near")).toBe(0n);
  });
});

describe("invoiceStatusFromPayment", () => {
  it.each([
    ["delivered_unverified", 125n * U, "pending"], // not verified on-chain yet
    ["verified", 125n * U, "paid"],
    ["verified", 120n * U, "underpaid"],
    ["verified", 126n * U, "overpaid"],
    ["awaiting_deposit", 0n, "open"],
    ["processing", 0n, "pending"],
    ["incomplete_deposit", 0n, "pending"],
    ["refunded", 0n, "refunded"],
    ["expired", 0n, "expired"],
    ["failed", 0n, "open"], // guest can retry with a new quote
  ] as const)("%s with %s received → %s", (p, received, out) => {
    expect(invoiceStatusFromPayment(p, received, 125n * U)).toBe(out);
  });
});

describe("1Click client", () => {
  const okJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("POSTs quotes with the API key and parses the deposit address", async () => {
    const fetch = vi.fn().mockResolvedValue(
      okJson({
        correlationId: "c1",
        timestamp: "2026-11-06T12:00:00Z",
        signature: "sig",
        quoteRequest: {},
        quote: { depositAddress: "0xDEPOSIT", amountIn: "125400000", minAmountIn: "125000000", amountOut: "125000000", minAmountOut: "125000000", timeEstimate: 20, deadline: "2026-11-06T13:00:00Z" },
      }),
    );
    const c = createOneClickClient({ apiKey: "k", fetch });
    const q = await c.quote(buildInvoiceQuote({ amount: 125n * U, originAsset: "a", destinationAsset: USDC, vaultAccount: "v.near", refundTo: "r", deadline: new Date("2026-11-06T13:00:00Z") }));
    expect(q.quote.depositAddress).toBe("0xDEPOSIT");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://1click.chaindefuser.com/v0/quote");
    expect(init.method).toBe("POST");
    expect(init.headers["X-API-Key"]).toBe("k");
  });

  it("omits the auth header without a key (0.2% fee path)", async () => {
    const fetch = vi.fn().mockResolvedValue(okJson([]));
    await createOneClickClient({ fetch }).tokens();
    expect(fetch.mock.calls[0][1].headers["X-API-Key"]).toBeUndefined();
  });

  it("GETs status by deposit address (URL-encoded)", async () => {
    const fetch = vi.fn().mockResolvedValue(
      okJson({ correlationId: "c", quoteResponse: {}, status: "SUCCESS", updatedAt: "2026-11-06T12:01:00Z", swapDetails: { intentHashes: [], nearTxHashes: ["abc"], amountOut: "125000000", originChainTxHashes: [], destinationChainTxHashes: [{ hash: "dst", explorerUrl: "x" }] } }),
    );
    const s = await createOneClickClient({ fetch }).status("0x A&B");
    expect(fetch.mock.calls[0][0]).toBe("https://1click.chaindefuser.com/v0/status?depositAddress=0x+A%26B");
    expect(s.status).toBe("SUCCESS");
    expect(s.swapDetails.destinationChainTxHashes[0].hash).toBe("dst");
  });

  it("turns 4xx into OneClickError with the API's message, and rejects malformed bodies", async () => {
    const c = createOneClickClient({ fetch: vi.fn().mockResolvedValue(okJson({ message: "amount is too low" }, 400)) });
    await expect(c.status("x")).rejects.toThrow(new OneClickError(400, "amount is too low"));
    const bad = createOneClickClient({ fetch: vi.fn().mockResolvedValue(okJson({ nope: true })) });
    await expect(bad.status("x")).rejects.toThrow(/unexpected response/i);
  });
});
