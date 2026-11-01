// The settlement agent's run loop (plan §6E). Deterministic: amounts come from lib/splits,
// permission comes from the vault. Steps: on-chain state → pre-check → chunk → settle → read the
// real outcome. The vault is injected, so this is unit-tested with a fake and integration-tested
// against the real contract on a sandbox.

import { classifyError, type ClassifiedError } from "@/lib/near/errors";
import type { SettleResult } from "@/lib/near/outcome";
import { type VaultPayee, settleGasTgas } from "@/lib/near/policy";
import type { PayoutItem } from "@/lib/splits";
import type { BookingPlan } from "./plan";
import { chunk, precheck } from "./precheck";

export type AgentVault = {
  getPayees(): Promise<VaultPayee[]>;
  remainingToday(): Promise<bigint>;
  balance(): Promise<bigint>;
  paidKeys(keys: string[]): Promise<Set<string>>;
  /** Sends one settle tx with the agent's function-call key. Throws near-api-js errors. */
  settle(items: PayoutItem[], gasTgas: number): Promise<SettleResult>;
};

export type AgentDeps = { vault: AgentVault; nowNs(): bigint };

export type ItemOutcome = {
  key: string;
  role: "owner" | "cleaner";
  payee: string;
  amount: bigint;
  status: "paid" | "pending" | "rejected";
  reason?: string;
  txHash?: string;
};

export type BookingOutcome = {
  bookingId: string;
  status: "paid" | "pending" | "blocked";
  reason?: string;
  retained: bigint; // manager share kept in the vault
  items: ItemOutcome[];
};

export type ChunkOutcome = { index: number; keys: string[]; result: SettleResult | { kind: "error"; error: ClassifiedError } };

export type RunOutcome = {
  status: "succeeded" | "partial" | "failed";
  plannedTotal: bigint;
  paidTotal: bigint;
  rejectedCount: number;
  bookings: BookingOutcome[];
  chunks: ChunkOutcome[];
  stoppedBecause?: ClassifiedError;
};

const roleOf = (key: string) => (key.endsWith(":cleaner") ? "cleaner" : "owner") as "owner" | "cleaner";

export async function runAgent(d: AgentDeps, plans: BookingPlan[]): Promise<RunOutcome> {
  const items = new Map<string, ItemOutcome>();
  for (const p of plans) for (const it of p.items) items.set(it.key, { ...it, role: roleOf(it.key), status: "pending" });
  const sendable = plans.filter((p) => !p.problem).flatMap((p) => p.items);
  const plannedTotal = sendable.reduce((a, i) => a + i.amount, 0n);
  const chunks: ChunkOutcome[] = [];
  let stoppedBecause: ClassifiedError | undefined;

  if (sendable.length > 0) {
    const [payees, remainingToday, vaultBalance, paidKeys] = await Promise.all([
      d.vault.getPayees(),
      d.vault.remainingToday(),
      d.vault.balance(),
      d.vault.paidKeys(sendable.map((i) => i.key)),
    ]);
    const pc = precheck({ payees, paidKeys, remainingToday, vaultBalance, nowNs: d.nowNs() }, sendable);
    for (const { item, reason } of pc.rejected) {
      const o = items.get(item.key)!;
      if (reason === "AlreadyPaid" && paidKeys.has(item.key)) o.status = "paid"; // already settled on-chain earlier
      else o.reason = reason;
    }

    const batches = chunk(pc.accepted);
    for (const [index, batch] of batches.entries()) {
      let result: ChunkOutcome["result"];
      try {
        result = await d.vault.settle(batch, settleGasTgas(batch.length));
      } catch (e) {
        result = { kind: "error", error: classifyError(e) };
      }
      chunks.push({ index, keys: batch.map((i) => i.key), result });
      for (const it of batch) {
        const o = items.get(it.key)!;
        if (result.kind === "error") o.reason = result.error.kind === "policy" ? result.error.code : result.error.kind;
        else {
          o.txHash = result.txHash;
          if (result.kind === "paid") o.status = "paid";
          else if (result.kind === "rejected") Object.assign(o, { status: "rejected", reason: result.code });
          else if (result.kind === "reverted") o.reason = "BatchReverted";
          else o.reason = "SettleFailed";
        }
      }
      // a misconfigured or compromised agent key stops everything
      if (result.kind === "error" && (result.error.kind === "key_scope" || result.error.kind === "allowance")) {
        stoppedBecause = result.error;
        for (const later of batches.slice(index + 1)) for (const it of later) items.get(it.key)!.reason = "RunStopped";
        break;
      }
    }
  }

  const bookings: BookingOutcome[] = plans.map((p) => {
    if (p.problem) return { bookingId: p.bookingId, status: "blocked", reason: p.problem, retained: 0n, items: [] };
    const its = p.items.map((i) => items.get(i.key)!);
    const paid = its.length > 0 && its.every((i) => i.status === "paid");
    return { bookingId: p.bookingId, status: paid ? "paid" : "pending", retained: paid ? p.split.manager : 0n, items: its };
  });

  const all = [...items.values()];
  const paidTotal = all.filter((i) => i.status === "paid").reduce((a, i) => a + i.amount, 0n);
  const notPaid = all.filter((i) => i.status !== "paid");
  const anyPaid = all.some((i) => i.status === "paid");
  const status: RunOutcome["status"] = stoppedBecause ? "failed" : notPaid.length === 0 ? "succeeded" : anyPaid ? "partial" : "failed";
  return { status, plannedTotal, paidTotal, rejectedCount: notPaid.length, bookings, chunks, stoppedBecause };
}
