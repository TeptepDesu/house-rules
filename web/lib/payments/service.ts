// Guest payment orchestration with injected I/O (1Click client + on-chain verifier), so every
// path is unit-tested. Route handlers persist the results. Status is never taken from the client.

import type { QuoteRequest, QuoteResponse, StatusResponse } from "@/lib/intents/client";
import { type PaymentStatus, buildInvoiceQuote, invoiceStatusFromPayment, mapStatus } from "@/lib/intents";
import type { InvoiceStatus } from "@/lib/reconcile";

export type PaymentDeps = {
  oneClick: { quote(req: QuoteRequest): Promise<QuoteResponse>; status(addr: string): Promise<StatusResponse> };
  /** USDC (raw) credited to the vault by these NEAR tx hashes, read from chain. */
  verifyDelivery(destinationTxHashes: string[]): Promise<bigint>;
  now(): Date;
};

const PAYABLE: InvoiceStatus[] = ["open", "expired"]; // expired quotes can be retried with a new one
const QUOTE_TTL_MS = 60 * 60 * 1000; // guests get an hour to send

export async function startPayment(
  d: PaymentDeps,
  i: {
    invoice: { id: string; amountRaw: bigint; status: InvoiceStatus };
    vaultAccount: string | null;
    usdcAssetId: string;
    originAsset: string;
    refundTo: string;
  },
): Promise<
  | { ok: true; depositAddress: string; depositMemo?: string; deadline: Date; amountIn: string; quoteRequest: QuoteRequest; quote: QuoteResponse }
  | { ok: false; error: "not_payable" | "no_vault" }
> {
  if (!PAYABLE.includes(i.invoice.status)) return { ok: false, error: "not_payable" };
  if (!i.vaultAccount) return { ok: false, error: "no_vault" };
  const deadline = new Date(d.now().getTime() + QUOTE_TTL_MS);
  const quoteRequest = buildInvoiceQuote({
    amount: i.invoice.amountRaw,
    originAsset: i.originAsset,
    destinationAsset: i.usdcAssetId,
    vaultAccount: i.vaultAccount,
    refundTo: i.refundTo,
    deadline,
  });
  const quote = await d.oneClick.quote(quoteRequest);
  if (!quote.quote.depositAddress) throw new Error("1Click returned no deposit address");
  return {
    ok: true,
    depositAddress: quote.quote.depositAddress,
    depositMemo: quote.quote.depositMemo,
    deadline: quote.quote.deadline ? new Date(quote.quote.deadline) : deadline,
    amountIn: quote.quote.amountIn,
    quoteRequest,
    quote,
  };
}

export type PollResult = {
  paymentStatus: PaymentStatus;
  invoiceStatus: InvoiceStatus;
  amountReceived: bigint;
  destinationTx?: string;
  originTx?: string;
  raw: StatusResponse;
};

export async function pollPayment(d: PaymentDeps, p: { depositAddress: string; deadline: Date; invoiceAmount: bigint }): Promise<PollResult> {
  const raw = await d.oneClick.status(p.depositAddress);
  let paymentStatus = mapStatus(raw.status as never, { deadline: p.deadline, now: d.now() });
  let amountReceived = 0n;
  const destHashes = raw.swapDetails.destinationChainTxHashes.map((t) => t.hash);
  if (paymentStatus === "delivered_unverified" && destHashes.length > 0) {
    const credited = await d.verifyDelivery(destHashes);
    if (credited > 0n) {
      paymentStatus = "verified";
      amountReceived = credited;
    }
  }
  return {
    paymentStatus,
    invoiceStatus: invoiceStatusFromPayment(paymentStatus, amountReceived, p.invoiceAmount),
    amountReceived,
    destinationTx: destHashes[0],
    originTx: raw.swapDetails.originChainTxHashes[0]?.hash,
    raw,
  };
}
