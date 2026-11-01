"use server";

import { refresh } from "next/cache";
import { agentMode } from "@/lib/agent/vault-factory";
import { requireUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/db";
import { recordVaultEvents } from "@/lib/db/audit";
import { getVaultAccount } from "@/lib/db/invoices";
import { getPayee, setPayeeVaultStatus } from "@/lib/db/people";
import { networkId } from "@/lib/near/network";
import { vaultEvents } from "@/lib/near/outcome";
import { verifyPayeeAdded } from "@/lib/near/payee-approval";
import { fetchTxOutcome, rpcUrl } from "@/lib/near/rpc";
import { createVaultReader } from "@/lib/near/vault";

// Approving a payee = the OPERATOR'S WALLET signs vault.add_payee. The server prepares the exact call
// (never the browser) and afterwards verifies the signed tx on-chain before recording anything.

const STORAGE_DEPOSIT_YOCTO = "10000000000000000000000"; // 0.01 NEAR: registers the payee on USDC
const GAS = "50000000000000"; // 50 TGas
const TX_HASH_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

export type Prepared =
  | { ok: true; mode: "live"; network: "testnet" | "mainnet"; vault: string; owner: string; args: Record<string, string>; deposit: string; gas: string }
  | { ok: true; mode: "rehearsal" }
  | { ok: false; error: string };

export async function prepareApproval(payeeId: string): Promise<Prepared> {
  const user = await requireUser();
  const payee = await getPayee(user.id, payeeId);
  if (!payee || payee.vaultStatus !== "pending_signature") return { ok: false, error: "This payee doesn't need approval." };
  const vault = await getVaultAccount(user.id);
  if (!vault) return { ok: false, error: "Connect your vault in Settings first." };
  if (agentMode() === "mock") return { ok: true, mode: "rehearsal" };
  try {
    const { owner } = await createVaultReader(rpcUrl(), vault).getPolicy();
    return {
      ok: true,
      mode: "live",
      network: networkId(),
      vault,
      owner,
      args: { account_id: payee.nearAccount, role: payee.role, cap_per_payout: payee.capRaw.toString() },
      deposit: STORAGE_DEPOSIT_YOCTO,
      gas: GAS,
    };
  } catch (e) {
    console.error("[people.prepareApproval] failed", e);
    return { ok: false, error: "Couldn't read your vault. Try again." };
  }
}

export async function confirmApproval(payeeId: string, txHash: string, signerId: string): Promise<{ ok: boolean; error?: string; status?: string }> {
  const user = await requireUser();
  if (!TX_HASH_RE.test(txHash)) return { ok: false, error: "That doesn't look like a NEAR transaction." };
  const payee = await getPayee(user.id, payeeId);
  const vault = await getVaultAccount(user.id);
  if (!payee || !vault) return { ok: false, error: "Payee or vault not found." };
  try {
    const { owner } = await createVaultReader(rpcUrl(), vault).getPolicy();
    if (signerId !== owner) return { ok: false, error: `Only the vault owner (${owner}) can approve payees.` };
    // the wallet returns as soon as it's submitted; give the chain a few seconds to finalize
    let tx = null;
    for (let i = 0; i < 6 && !tx; i++) {
      tx = await fetchTxOutcome(txHash, signerId);
      if (!tx) await new Promise((r) => setTimeout(r, 2_000));
    }
    if (!tx) return { ok: false, error: "Couldn't find that transaction yet. Try again in a moment." };
    const check = verifyPayeeAdded(tx, vault, payee.nearAccount);
    if (!check.ok) return { ok: false, error: "That transaction didn't approve this payee in your vault." };
    const status = BigInt(Date.now()) * 1_000_000n >= check.payableFromNs ? "active" : "in_delay";
    await setPayeeVaultStatus(user.id, payeeId, status, txHash);
    await recordVaultEvents(user.id, txHash, vaultEvents(tx, vault));
    await logActivity({ userId: user.id, action: "payee.approve", entity: "payee", entityId: payeeId, meta: { nearAccount: payee.nearAccount, txHash } });
    refresh();
    return { ok: true, status };
  } catch (e) {
    console.error("[people.confirmApproval] failed", e);
    return { ok: false, error: "Couldn't verify the approval. Try again." };
  }
}

/** Rehearsal mode only: no chain to sign on, so mark the payee approved (clearly labelled in the UI). */
export async function rehearsalApprove(payeeId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (agentMode() !== "mock") return { ok: false, error: "Approve with your wallet." };
  const payee = await getPayee(user.id, payeeId);
  if (!payee || payee.vaultStatus !== "pending_signature") return { ok: false, error: "This payee doesn't need approval." };
  await setPayeeVaultStatus(user.id, payeeId, "active");
  await logActivity({ userId: user.id, action: "payee.approve_rehearsal", entity: "payee", entityId: payeeId, meta: { nearAccount: payee.nearAccount } });
  refresh();
  return { ok: true };
}
