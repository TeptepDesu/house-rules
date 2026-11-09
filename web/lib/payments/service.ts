// Guest payment orchestration with injected I/O (1Click client + on-chain verifier), so every
// path is unit-tested. Route handlers persist the results. Status is never taken from the client.

import type { QuoteRequest, QuoteResponse, StatusResponse } from "@/lib/intents/client";
import { type PaymentStatus, buildInvoiceQuote, invoiceStatusFromPayment, mapStatus } from "@/lib/intents";
import type { InvoiceStatus } from "@/lib/reconcile";

export type PaymentDeps = {
  oneClick: { quote(req: QuoteRequest): Promise<QuoteResponse>; status(addr: string, memo?: string): Promise<StatusResponse> };
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

/**
 * The NEAR txs to check for the vault's credit. The destination-chain txs when 1Click lists any;
 * otherwise the swap's NEAR txs, since 1Click doesn't document which list holds a delivery to NEAR
 * (confirm on the first mainnet payment, docs/mainnet-runbook.md step 8). Never both, and each tx
 * once, so one credit can't be counted twice.
 */
function deliveryTxs(s: StatusResponse["swapDetails"]): { hashes: string[]; listedAsDelivery: boolean } {
  const dest = s.destinationChainTxHashes.map((t) => t.hash);
  return dest.length > 0 ? { hashes: [...new Set(dest)], listedAsDelivery: true } : { hashes: [...new Set(s.nearTxHashes)], listedAsDelivery: false };
}

export async function pollPayment(
  d: PaymentDeps,
  p: { depositAddress: string; depositMemo?: string | null; deadline: Date; invoiceAmount: bigint },
): Promise<PollResult> {
  // 1Click requires the memo whenever the quote came with one
  const raw = await d.oneClick.status(p.depositAddress, p.depositMemo ?? undefined);
  let paymentStatus = mapStatus(raw.status as never, { deadline: p.deadline, now: d.now() });
  let amountReceived = 0n;
  let creditedBy: string | undefined;
  const { hashes, listedAsDelivery } = deliveryTxs(raw.swapDetails);
  if (paymentStatus === "delivered_unverified") {
    // one tx at a time, so the payment records the tx that actually credited the vault (the
    // destination_tx column is unique: one tx can only ever pay one payment)
    for (const h of hashes) {
      const credited = await d.verifyDelivery([h]);
      if (credited > 0n) {
        amountReceived += credited;
        creditedBy ??= h;
      }
    }
    if (amountReceived > 0n) paymentStatus = "verified";
  }
  return {
    paymentStatus,
    invoiceStatus: invoiceStatusFromPayment(paymentStatus, amountReceived, p.invoiceAmount),
    amountReceived,
    destinationTx: creditedBy ?? (listedAsDelivery ? hashes[0] : undefined),
    originTx: raw.swapDetails.originChainTxHashes[0]?.hash,
    raw,
  };
}
