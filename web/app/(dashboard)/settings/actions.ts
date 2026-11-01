"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { JsonRpcProvider } from "near-api-js";
import { z } from "zod";
import { agentMode } from "@/lib/agent/vault-factory";
import { requireUser } from "@/lib/auth/dal";
import { resolveSessionSecret } from "@/lib/auth/token";
import { LINK_MESSAGE, LINK_RECIPIENT, makeLinkChallenge, readLinkChallenge, verifyWalletLink } from "@/lib/auth/wallet-link";
import { getOperatorAccount, logActivity, setOperatorAccount } from "@/lib/db";
import { setVaultAccount } from "@/lib/db/invoices";
import { checkAccountForNetwork } from "@/lib/near/account";
import { networkId } from "@/lib/near/network";
import { rpcUrl } from "@/lib/near/rpc";
import { checkVaultBinding } from "@/lib/vault/binding";

const LINK_COOKIE = "hr_link";

export type VaultState = { ok?: boolean; error?: string; value?: string } | undefined;

/**
 * Record which vault guest payments go to and payouts come from. In live mode the vault must be
 * owned ON-CHAIN by the operator's verified wallet and use this server's agent (checkVaultBinding).
 * Rehearsal mode has no chain: each operator's simulated vault is their own.
 */
export async function saveVaultAccount(_prev: VaultState, formData: FormData): Promise<VaultState> {
  const user = await requireUser();
  const value = String(formData.get("vaultAccount") ?? "")
    .trim()
    .toLowerCase();
  const problem = checkAccountForNetwork(value, networkId());
  if (problem) return { error: problem, value };
  try {
    if (agentMode() === "live") {
      const binding = await checkVaultBinding(value, await getOperatorAccount(user.id));
      if (!binding.ok) return { error: binding.error, value };
    }
    await setVaultAccount(user.id, value);
    await logActivity({ userId: user.id, action: "vault.set_account", entity: "user", entityId: user.id, meta: { vaultAccount: value } });
  } catch (e) {
    console.error("[settings.saveVaultAccount] failed", e);
    return { error: "Couldn't save. Try again.", value };
  }
  refresh();
  return { ok: true, value };
}

/** Step 1 of linking a wallet: a one-time challenge (nonce) for the wallet to sign (NEP-413). */
export async function startWalletLink(): Promise<{ message: string; recipient: string; nonce: string; network: "testnet" | "mainnet" }> {
  const user = await requireUser();
  const { nonce, token } = await makeLinkChallenge(user.id, resolveSessionSecret());
  (await cookies()).set(LINK_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 300 });
  return { message: LINK_MESSAGE, recipient: LINK_RECIPIENT, nonce: Buffer.from(nonce).toString("base64"), network: networkId() };
}

const Signed = z.object({ accountId: z.string().min(2).max(64), publicKey: z.string().min(10).max(120), signature: z.string().min(10).max(200) });

/** Step 2: verify the signature over that exact challenge, by a full-access key of the account. */
export async function finishWalletLink(input: unknown): Promise<{ ok: boolean; accountId?: string; error?: string }> {
  const user = await requireUser();
  const parsed = Signed.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The wallet's response didn't look right." };
  const jar = await cookies();
  const nonce = await readLinkChallenge(jar.get(LINK_COOKIE)?.value, user.id, resolveSessionSecret());
  jar.delete(LINK_COOKIE); // one try per challenge
  if (!nonce) return { ok: false, error: "That request expired. Try linking again." };
  const problem = checkAccountForNetwork(parsed.data.accountId, networkId());
  if (problem) return { ok: false, error: problem };
  const r = await verifyWalletLink({ signed: parsed.data, nonce, provider: new JsonRpcProvider({ url: rpcUrl() }) });
  if (!r.ok) {
    console.warn("[settings.finishWalletLink] rejected", r.error);
    return { ok: false, error: "We couldn't verify that signature. Sign with a full-access key of your account." };
  }
  await setOperatorAccount(user.id, r.accountId);
  await logActivity({ userId: user.id, action: "wallet.link", entity: "user", entityId: user.id, meta: { operatorAccount: r.accountId } });
  refresh();
  return { ok: true, accountId: r.accountId };
}
