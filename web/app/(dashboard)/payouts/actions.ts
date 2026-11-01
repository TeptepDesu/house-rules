"use server";

import { refresh } from "next/cache";
import { runAgentForUser } from "@/lib/agent/service";
import { agentVaultFor } from "@/lib/agent/vault-factory";
import { requireUser } from "@/lib/auth/dal";

export type RunState =
  | { ok: true; status: string; paid: string; payouts: number; txs: string[]; held: number; stopped?: string }
  | { ok: false; error: string }
  | undefined;

export async function runAgentNow(): Promise<RunState> {
  const user = await requireUser();
  const setup = await agentVaultFor(user.id);
  if (!setup.ok) {
    const error =
      setup.reason === "no_vault"
        ? "Connect your vault in Settings first."
        : setup.reason === "vault_not_verified"
          ? (setup.message ?? "Your vault isn't verified as yours.")
          : "The payout agent isn't configured on this server yet.";
    return { ok: false, error };
  }
  const r = await runAgentForUser(user.id, "manual", setup.vault);
  refresh();
  if (!r.ok) return { ok: false, error: r.message };
  const o = r.outcome;
  const paidItems = o.bookings.flatMap((b) => b.items).filter((i) => i.status === "paid");
  return {
    ok: true,
    status: o.status,
    paid: o.paidTotal.toString(),
    payouts: paidItems.length,
    txs: o.chunks.flatMap((c) => ("txHash" in c.result && c.result.txHash ? [c.result.txHash] : [])),
    held: o.rejectedCount,
    stopped: o.stoppedBecause?.kind,
  };
}
