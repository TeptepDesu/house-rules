"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/db";
import { setVaultAccount } from "@/lib/db/invoices";
import { checkAccountForNetwork } from "@/lib/near/account";
import { networkId } from "@/lib/near/network";

export type VaultState = { ok?: boolean; error?: string; value?: string } | undefined;

/**
 * Record which vault guest payments go to. On-chain verification that this vault's owner is the
 * operator's wallet comes with the wallet connection (get_policy().owner === operator account).
 */
export async function saveVaultAccount(_prev: VaultState, formData: FormData): Promise<VaultState> {
  const user = await requireUser();
  const value = String(formData.get("vaultAccount") ?? "")
    .trim()
    .toLowerCase();
  const problem = checkAccountForNetwork(value, networkId());
  if (problem) return { error: problem, value };
  try {
    await setVaultAccount(user.id, value);
    await logActivity({ userId: user.id, action: "vault.set_account", entity: "user", entityId: user.id, meta: { vaultAccount: value } });
  } catch (e) {
    console.error("[settings.saveVaultAccount] failed", e);
    return { error: "Couldn't save. Try again.", value };
  }
  refresh();
  return { ok: true, value };
}
