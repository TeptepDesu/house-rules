"use server";

import { refresh } from "next/cache";
import { agentMode } from "@/lib/agent/vault-factory";
import { requireUser } from "@/lib/auth/dal";
import { getOperatorAccount, logActivity } from "@/lib/db";
import { recordVaultEvents } from "@/lib/db/audit";
import { getVaultAccount } from "@/lib/db/invoices";
import { getPayee, setPayeeVaultStatus } from "@/lib/db/people";
import { networkId } from "@/lib/near/network";
import { vaultEvents } from "@/lib/near/outcome";
import { verifyPayeeAdded } from "@/lib/near/payee-approval";
import { fetchTxOutcome, rpcUrl } from "@/lib/near/rpc";
import { createVaultReader } from "@/lib/near/vault";
import { checkVaultBinding } from "@/lib/vault/binding";
import { payeeVaultStatus } from "@/lib/vault/rules";

// Approving a payee = the operator's VERIFIED wallet (the vault's on-chain owner) signs
// vault.add_payee. The server prepares the exact call and afterwards takes the payee's status from
// the vault itself (chain is the source of truth). Nothing here trusts an account id from the client.

const STORAGE_DEPOSIT_YOCTO = "10000000000000000000000"; // 0.01 NEAR: registers the payee on USDC
const GAS = "50000000000000"; // 50 TGas
const TX_HASH_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

export type Prepared =
  | { ok: true; mode: "live"; network: "testnet" | "mainnet"; vault: string; owner: string; args: Record<string, string>; deposit: string; gas: string }
  | { ok: true; mode: "rehearsal" }
  | { ok: false; error: string };

async function context(userId: string, payeeId: string) {
  const payee = await getPayee(userId, payeeId);
  if (!payee || payee.vaultStatus !== "pending_signature") return { error: "This payee doesn't need approval." } as const;
  const vault = await getVaultAccount(userId);
  if (!vault) return { error: "Connect your vault in Settings first." } as const;
  return { payee, vault } as const;
}

export async function prepareApproval(payeeId: string): Promise<Prepared> {
  const user = await requireUser();
  const c = await context(user.id, payeeId);
  if ("error" in c) return { ok: false, error: c.error! };
  if (agentMode() === "mock") return { ok: true, mode: "rehearsal" };
  const owner = await getOperatorAccount(user.id);
  const binding = await checkVaultBinding(c.vault, owner);
  if (!binding.ok || !owner) return { ok: false, error: binding.ok ? "Link your NEAR wallet in Settings first." : binding.error };
  return {
    ok: true,
    mode: "live",
    network: networkId(),
    vault: c.vault,
    owner,
    args: { account_id: c.payee.nearAccount, role: c.payee.role, cap_per_payout: c.payee.capRaw.toString() },
    deposit: STORAGE_DEPOSIT_YOCTO,
    gas: GAS,
  };
}

export type Confirmed = { ok: true; status: string } | { ok: false; error: string; retry?: boolean };

/** After signing (or to re-check later without signing again): read the payee from the vault. */
export async function confirmApproval(payeeId: string, txHash?: string): Promise<Confirmed> {
  const user = await requireUser();
  const c = await context(user.id, payeeId);
  if ("error" in c) return { ok: false, error: c.error! };
  const owner = await getOperatorAccount(user.id);
  const binding = await checkVaultBinding(c.vault, owner);
  if (!binding.ok || !owner) return { ok: false, error: binding.ok ? "Link your NEAR wallet in Settings first." : binding.error };
  try {
    const chain = await createVaultReader(rpcUrl(), c.vault).getPayee(c.payee.nearAccount);
    if (!chain) return { ok: false, retry: true, error: "Your vault doesn't show this payee yet. Check again in a moment." };
    if (chain.role !== c.payee.role || chain.capPerPayout !== c.payee.capRaw) {
      return { ok: false, error: "Your vault has this payee with a different role or limit than here. Fix one so they match." };
    }
    const status = payeeVaultStatus(chain, BigInt(Date.now()) * 1_000_000n);
    if (status === "removed") return { ok: false, error: "This payee is removed in your vault." };

    // the tx is only for the audit trail: record it if it really is this payee's approval by the owner
    let addedTx: string | undefined;
    if (txHash && TX_HASH_RE.test(txHash)) {
      const tx = await fetchTxOutcome(txHash, owner);
      if (tx && verifyPayeeAdded(tx, c.vault, c.payee.nearAccount).ok) {
        addedTx = txHash;
        await recordVaultEvents(user.id, txHash, vaultEvents(tx, c.vault));
      }
    }
    await setPayeeVaultStatus(user.id, payeeId, status, addedTx);
    await logActivity({ userId: user.id, action: "payee.approve", entity: "payee", entityId: payeeId, meta: { nearAccount: c.payee.nearAccount, txHash: addedTx } });
    refresh();
    return { ok: true, status };
  } catch (e) {
    console.error("[people.confirmApproval] failed", e);
    return { ok: false, retry: true, error: "Couldn't check your vault. Try again." };
  }
}

/** Rehearsal mode only: no chain to sign on, so mark the payee approved (clearly labelled in the UI). */
export async function rehearsalApprove(payeeId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (agentMode() !== "mock") return { ok: false, error: "Approve with your wallet." };
  const c = await context(user.id, payeeId);
  if ("error" in c) return { ok: false, error: c.error };
  await setPayeeVaultStatus(user.id, payeeId, "active");
  await logActivity({ userId: user.id, action: "payee.approve_rehearsal", entity: "payee", entityId: payeeId, meta: { nearAccount: c.payee.nearAccount } });
  refresh();
  return { ok: true };
}
