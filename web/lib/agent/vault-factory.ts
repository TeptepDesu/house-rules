import "server-only";
import { getOperatorAccount } from "@/lib/db";
import { listPayees } from "@/lib/db/people";
import { checkVaultBinding } from "@/lib/vault/binding";
import { createRehearsalVault, sharedRehearsalStore } from "@/lib/vault/rehearsal";
import { getVaultAccount } from "@/lib/db/invoices";
import { rpcUrl } from "@/lib/near/rpc";
import { createAgentVault } from "@/lib/near/vault";
import type { AgentVault } from "./run";

// Which vault the agent talks to.
//   AGENT_MODE        mock (default outside production) | live
//   AGENT_ACCOUNT     account holding the agent's function-call key (live)
//   AGENT_PRIVATE_KEY that FUNCTION-CALL key, scoped to vault.settle (live; server-only, never NEXT_PUBLIC_)
// mock: lib/vault/rehearsal.ts, an in-process vault with the real vault's rules (approved payees,
// caps, paid-once keys, daily limit) that "pays" with fake tx hashes, for dev and demo rehearsals. The real path is covered by test:integration.

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
  return { ok: true, mode, vaultAccount, vault: createRehearsalVault(userId, () => listPayees(userId), sharedRehearsalStore(), () => BigInt(Date.now()) * 1_000_000n) };
}
