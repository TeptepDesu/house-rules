// Guest payments via 1Click (plan §1, §2). Pure helpers: quote building, status mapping, and
// on-chain proof of delivery. Payment status is never taken from the client (CLAUDE.md).

import type { TxOutcome } from "@/lib/near/outcome";
import type { InvoiceStatus } from "@/lib/reconcile";
import type { OneClickStatus, QuoteRequest } from "./client";

export type PaymentStatus =
  | "awaiting_deposit"
  | "processing"
  | "incomplete_deposit"
  | "delivered_unverified" // 1Click says SUCCESS; not yet confirmed on-chain by us
  | "verified" // we saw the USDC land in the vault on-chain
  | "refunded"
  | "expired"
  | "failed";

/** One quote per invoice payment: exact USDC to the vault, refunds back to the guest's origin chain. */
export function buildInvoiceQuote(i: {
  amount: bigint;
  originAsset: string;
  destinationAsset: string; // USDC on NEAR (nep141:...)
  vaultAccount: string;
  refundTo: string;
  deadline: Date;
  dry?: boolean;
  slippageBps?: number;
}): QuoteRequest {
  if (i.amount <= 0n) throw new Error("amount must be positive");
  return {
    dry: i.dry ?? false,
    swapType: "EXACT_OUTPUT",
    slippageTolerance: i.slippageBps ?? 100,
    originAsset: i.originAsset,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: i.destinationAsset,
    amount: i.amount.toString(),
    refundTo: i.refundTo,
    refundType: "ORIGIN_CHAIN",
    recipient: i.vaultAccount,
    recipientType: "DESTINATION_CHAIN",
    deadline: i.deadline.toISOString(),
  };
}

export function mapStatus(s: OneClickStatus, t: { deadline: Date; now: Date }): PaymentStatus {
  switch (s) {
    case "PENDING_DEPOSIT":
      return t.now > t.deadline ? "expired" : "awaiting_deposit";
    case "KNOWN_DEPOSIT_TX":
    case "PROCESSING":
      return "processing";
    case "INCOMPLETE_DEPOSIT":
      return "incomplete_deposit";
    case "SUCCESS":
      return "delivered_unverified";
    case "REFUNDED":
      return "refunded";
    case "FAILED":
      return "failed";
    default:
      return "processing"; // unknown/new status: keep polling, never treat as paid
  }
}

/**
 * USDC credited to `recipient` in a NEAR tx, from NEP-141 ft_transfer events on SUCCESSFUL
 * receipts executed by the token contract itself. Reverted receipts keep their logs, so
 * status is checked (spike #1).
 */
export function usdcCreditedTo(tx: TxOutcome, tokenAccount: string, recipient: string): bigint {
  let total = 0n;
  for (const r of tx.receipts_outcome) {
    const st = r.outcome.status;
    const ok = typeof st === "object" && st !== null && ("SuccessValue" in st || "SuccessReceiptId" in st);
    if (!ok || r.outcome.executor_id !== tokenAccount) continue;
    for (const log of r.outcome.logs) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      try {
        const e = JSON.parse(log.slice(11));
        if (e.standard !== "nep141" || e.event !== "ft_transfer" || !Array.isArray(e.data)) continue;
        for (const d of e.data) if (d.new_owner_id === recipient && /^\d+$/.test(d.amount)) total += BigInt(d.amount);
      } catch {
        // not an event
      }
    }
  }
  return total;
}

/** Invoice status from a payment's state and the verified amount received. */
export function invoiceStatusFromPayment(p: PaymentStatus, received: bigint, invoiceAmount: bigint): InvoiceStatus {
  switch (p) {
    case "verified":
      return received === invoiceAmount ? "paid" : received < invoiceAmount ? "underpaid" : "overpaid";
    case "awaiting_deposit":
    case "failed":
      return "open";
    case "refunded":
      return "refunded";
    case "expired":
      return "expired";
    default:
      return "pending";
  }
}
