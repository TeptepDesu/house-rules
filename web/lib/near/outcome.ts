// Read vault results from a raw RPC transaction outcome (what near-api-js signAndSendTransaction
// returns). Rules from spike #1, both visible in test/fixtures/rpc:
//   - A failed payout batch does NOT fail the tx: final status is SuccessValue("false").
//   - Reverted receipts still carry logs (the token's ft_transfer events for undone transfers).
//     So events are read only from SUCCESSFUL receipts executed by the vault itself.

import { parsePolicyCode } from "./errors";
import type { PolicyCode } from "./policy";

type ExecStatus = { SuccessValue: string } | { SuccessReceiptId: string } | { Failure: unknown } | string;

export type TxOutcome = {
  status: ExecStatus;
  transaction: { hash: string };
  receipts_outcome: { id: string; outcome: { executor_id: string; logs: string[]; status: ExecStatus } }[];
};

export type VaultEvent = { event: string; data: Record<string, unknown>; receiptId: string };

const isSuccess = (s: ExecStatus) => typeof s === "object" && s !== null && ("SuccessValue" in s || "SuccessReceiptId" in s);

export function vaultEvents(tx: TxOutcome, vaultId: string): VaultEvent[] {
  const out: VaultEvent[] = [];
  for (const r of tx.receipts_outcome) {
    if (r.outcome.executor_id !== vaultId || !isSuccess(r.outcome.status)) continue;
    for (const log of r.outcome.logs) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      try {
        const j = JSON.parse(log.slice("EVENT_JSON:".length));
        if (j.standard === "houserules" && typeof j.event === "string") out.push({ event: j.event, data: j.data ?? {}, receiptId: r.id });
      } catch {
        // malformed log: not ours
      }
    }
  }
  return out;
}

export type SettleResult =
  | { kind: "paid"; keys: string[]; total: bigint; txHash: string; events?: VaultEvent[] }
  | { kind: "reverted"; keys: string[]; total: bigint; txHash: string; events?: VaultEvent[] }
  | { kind: "rejected"; code: PolicyCode; txHash: string }
  | { kind: "failed"; message: string; txHash: string };

function failureMessage(f: unknown): string {
  // ActionError.kind.FunctionCallError.ExecutionError is where contract panics land
  const find = (x: unknown): string | null => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o.ExecutionError === "string") return o.ExecutionError;
      for (const v of Object.values(o)) {
        const s = find(v);
        if (s) return s;
      }
    }
    return null;
  };
  return find(f) ?? JSON.stringify(f);
}

function decodeBase64(s: string): string {
  try {
    return atob(s);
  } catch {
    return "";
  }
}

/** What actually happened to a settle call. Anything unexpected is "failed", never "paid". */
export function settleResult(tx: TxOutcome, vaultId: string): SettleResult {
  const txHash = tx.transaction.hash;
  const st = tx.status;
  if (typeof st === "object" && st !== null && "Failure" in st) {
    const message = failureMessage(st.Failure);
    const code = parsePolicyCode(message);
    return code ? { kind: "rejected", code, txHash } : { kind: "failed", message, txHash };
  }
  const value = typeof st === "object" && st !== null && "SuccessValue" in st ? decodeBase64(st.SuccessValue) : "";
  const events = vaultEvents(tx, vaultId);
  const pick = (name: string) => events.find((e) => e.event === name)?.data as { keys?: string[]; total?: string } | undefined;
  const settled = pick("settled");
  const failed = pick("settle_failed");
  if (value === "true" && settled?.keys && settled.total) {
    return { kind: "paid", keys: settled.keys, total: BigInt(settled.total), txHash, events };
  }
  if (value === "false" && failed?.keys && failed.total) {
    return { kind: "reverted", keys: failed.keys, total: BigInt(failed.total), txHash, events };
  }
  return { kind: "failed", message: `unexpected settle outcome (return ${JSON.stringify(value)})`, txHash };
}
