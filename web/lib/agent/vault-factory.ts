import "server-only";
import { getOperatorAccount } from "@/lib/db";
import { listPayees } from "@/lib/db/people";
import { checkVaultBinding } from "@/lib/vault/binding";
import { getVaultAccount } from "@/lib/db/invoices";
import type { VaultPayee } from "@/lib/near/policy";
import { rpcUrl } from "@/lib/near/rpc";
import { createAgentVault } from "@/lib/near/vault";
import type { AgentVault } from "./run";

// Which vault the agent talks to.
//   AGENT_MODE        mock (default outside production) | live
//   AGENT_ACCOUNT     account holding the agent's function-call key (live)
//   AGENT_PRIVATE_KEY that FUNCTION-CALL key, scoped to vault.settle (live; server-only, never NEXT_PUBLIC_)
// mock: an in-process vault that applies the operator's DB payees and caps and "pays" with fake tx
// hashes, for dev and demo rehearsals. The real path is covered by test:integration.

export type AgentMode = "mock" | "live";

export function agentMode(env: Record<string, string | undefined> = process.env): AgentMode {
  if (env.NODE_ENV === "production") {
    if (env.AGENT_MODE === "mock") throw new Error("AGENT_MODE=mock is not allowed in production");
    return "live";
  }
  return env.AGENT_MODE === "live" ? "live" : "mock";
}

export type VaultSetup =
  | { ok: true; vault: AgentVault; mode: AgentMode; vaultAccount: string }
  | { ok: false; reason: "no_vault" | "no_agent_key" | "vault_not_verified"; message?: string };

export async function agentVaultFor(userId: string): Promise<VaultSetup> {
  const vaultAccount = await getVaultAccount(userId);
  if (!vaultAccount) return { ok: false, reason: "no_vault" };
  const mode = agentMode();
  if (mode === "live") {
    const agentAccount = process.env.AGENT_ACCOUNT;
    const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
    if (!agentAccount || !agentPrivateKey) return { ok: false, reason: "no_agent_key" };
    // defense in depth: never pay through a vault this operator hasn't proven they own
    const binding = await checkVaultBinding(vaultAccount, await getOperatorAccount(userId));
    if (!binding.ok) return { ok: false, reason: "vault_not_verified", message: binding.error };
    return { ok: true, mode, vaultAccount, vault: createAgentVault({ rpcUrl: rpcUrl(), vault: vaultAccount, agentAccount, agentPrivateKey }) };
  }
  return { ok: true, mode, vaultAccount, vault: mockVault(userId) };
}

/** Process-wide paid-key memory so mock runs are idempotent like the real vault. */
function mockPaidKeys(): Set<string> {
  const g = globalThis as unknown as { __hrMockPaid?: Set<string> };
  return (g.__hrMockPaid ??= new Set());
}

function mockVault(userId: string): AgentVault {
  const paid = mockPaidKeys();
  let n = 0;
  return {
    async getPayees(): Promise<VaultPayee[]> {
      return (await listPayees(userId))
        .filter((p) => p.vaultStatus !== "removed")
        .map((p) => ({ accountId: p.nearAccount, role: p.role, capPerPayout: p.capRaw, payableFromNs: 0n, active: true }));
    },
    remainingToday: async () => 1_000_000n * 1_000_000n,
    balance: async () => 1_000_000n * 1_000_000n,
    paidKeys: async (keys) => new Set(keys.filter((k) => paid.has(k))),
    async settle(items) {
      items.forEach((i) => paid.add(i.key));
      const keys = items.map((i) => i.key);
      const total = items.reduce((a, i) => a + i.amount, 0n);
      const txHash = `mock-settle-${Date.now().toString(36)}-${++n}`;
      const wire = items.map((i) => ({ key: i.key, payee: i.payee, amount: i.amount.toString() }));
      // same event shapes the real vault emits (docs/vault-spec.md), so the audit log looks identical
      const events = [
        { event: "settle_started", data: { items: wire, total: total.toString() }, receiptId: `${txHash}-r1` },
        { event: "settled", data: { keys, total: total.toString() }, receiptId: `${txHash}-r2` },
      ];
      return { kind: "paid", keys, total, txHash, events };
    },
  };
}
