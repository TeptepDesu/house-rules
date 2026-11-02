"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { agentMode } from "@/lib/agent/vault-factory";
import { requireUser } from "@/lib/auth/dal";
import { getOperatorAccount, logActivity } from "@/lib/db";
import { recordVaultEvents } from "@/lib/db/audit";
import { getVaultAccount } from "@/lib/db/invoices";
import { getPayee, setPayeeCap, setPayeeVaultStatus } from "@/lib/db/people";
import { parseUsd } from "@/lib/money";
import { networkId } from "@/lib/near/network";
import { vaultEvents } from "@/lib/near/outcome";
import { fetchTxOutcome, rpcUrl } from "@/lib/near/rpc";
import { createVaultReader } from "@/lib/near/vault";
import { checkVaultBinding } from "@/lib/vault/binding";
import {
  type WalletCall,
  capChangeCalls,
  capChangedOnChain,
  limitsOnChain,
  parseLimits,
  removePayeeCalls,
  removedOnChain,
  setLimitsCalls,
  untilOnChain,
  verifyWithdrawn,
  withdrawCalls,
} from "@/lib/vault/owner-actions";
import { payeeVaultStatus } from "@/lib/vault/rules";

// Owner actions on the vault (remove payee, change a cap, change limits, withdraw). Same shape as
// "Approve in vault": the server prepares the exact calls, the operator's VERIFIED wallet (the
// vault's on-chain owner) signs them, and the server confirms by reading the chain. Payee accounts
// come from the operator's own records; withdrawals only go to the operator's own linked wallet.
// In rehearsal (no chain) payee changes apply directly; limits and withdrawals need a live vault.

const TX_HASH_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;
const MAX_CAP = parseUsd("50000");

const Input = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("remove"), payeeId: z.string().uuid() }),
  z.object({ kind: z.literal("cap"), payeeId: z.string().uuid(), cap: z.string().max(20) }),
  z.object({ kind: z.literal("limits"), daily: z.string().max(20), delayHours: z.string().max(6) }),
  z.object({ kind: z.literal("withdraw"), amount: z.string().max(20) }),
]);
export type OwnerActionInput = z.infer<typeof Input>;

export type OwnerPrepared =
  | { ok: true; mode: "direct" }
  | { ok: true; mode: "live"; network: "testnet" | "mainnet"; vault: string; owner: string; calls: WalletCall[] }
  | { ok: false; error: string; field?: string };
export type OwnerConfirmed = { ok: true } | { ok: false; error: string; retry?: boolean };

const fail = (error: string, field?: string) => ({ ok: false as const, error, ...(field ? { field } : {}) });

type Plan =
  | { kind: "remove" | "cap"; payee: NonNullable<Awaited<ReturnType<typeof getPayee>>>; cap?: bigint; onChain: boolean }
  | { kind: "limits"; dailyLimit: bigint; payeeDelayNs: bigint; onChain: true }
  | { kind: "withdraw"; amount: bigint; onChain: true };

/** Validate and resolve everything from the server's own records. Never trusts ids from the client. */
async function plan(userId: string, raw: unknown, opts: { checkBalance?: boolean } = {}): Promise<{ plan: Plan; vault: string | null } | { error: string; field?: string }> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { error: "That request isn't valid." };
  const i = parsed.data;
  const vault = await getVaultAccount(userId);
  const live = agentMode() === "live";
  if (i.kind === "remove" || i.kind === "cap") {
    const payee = await getPayee(userId, i.payeeId);
    if (!payee || payee.vaultStatus === "removed") return { error: "Payee not found." };
    let cap: bigint | undefined;
    if (i.kind === "cap") {
      try {
        cap = parseUsd(i.cap);
      } catch {
        return { error: "Enter a dollar amount, e.g. 900", field: "cap" };
      }
      if (cap <= 0n || cap > MAX_CAP) return { error: "Enter between $0.01 and $50,000", field: "cap" };
      if (cap === payee.capRaw) return { error: "That's the current limit.", field: "cap" };
    }
    // a payee that was never approved isn't on the vault: the change is app-only
    return { plan: { kind: i.kind, payee, cap, onChain: live && payee.vaultStatus !== "pending_signature" }, vault };
  }
  if (!live) return { error: "Changing limits and withdrawing need your live vault (rehearsal mode has no chain)." };
  if (!vault) return { error: "Connect your vault in Settings first." };
  if (i.kind === "limits") {
    const l = parseLimits(i.daily, i.delayHours);
    if (!l.ok) return { error: l.error, field: l.field };
    return { plan: { kind: "limits", dailyLimit: l.dailyLimit, payeeDelayNs: l.payeeDelayNs, onChain: true }, vault };
  }
  let amount: bigint;
  try {
    amount = parseUsd(i.amount);
  } catch {
    return { error: "Enter a dollar amount, e.g. 126.50", field: "amount" };
  }
  if (amount <= 0n) return { error: "Enter an amount above $0", field: "amount" };
  // only before signing: after a withdrawal the balance has (rightly) gone down
  if (opts.checkBalance && amount > (await createVaultReader(rpcUrl(), vault).balance())) return { error: "That's more than the vault holds.", field: "amount" };
  return { plan: { kind: "withdraw", amount, onChain: true }, vault };
}

async function ownerContext(userId: string, vault: string | null) {
  if (!vault) return { error: "Connect your vault in Settings first." } as const;
  const owner = await getOperatorAccount(userId);
  const binding = await checkVaultBinding(vault, owner);
  if (!binding.ok || !owner) return { error: binding.ok ? "Link your NEAR wallet in Settings first." : binding.error } as const;
  return { vault, owner } as const;
}

function callsFor(p: Plan, owner: string): WalletCall[] {
  switch (p.kind) {
    case "remove":
      return removePayeeCalls(p.payee.nearAccount);
    case "cap":
      return capChangeCalls(p.payee.nearAccount, p.payee.role, p.cap!);
    case "limits":
      return setLimitsCalls(p.dailyLimit, p.payeeDelayNs);
    case "withdraw":
      return withdrawCalls(p.amount, owner); // only ever to the operator's own verified wallet
  }
}

export async function prepareOwnerAction(input: OwnerActionInput): Promise<OwnerPrepared> {
  const user = await requireUser();
  const r = await plan(user.id, input, { checkBalance: true });
  if ("error" in r) return fail(r.error, r.field);
  if (!r.plan.onChain) return { ok: true, mode: "direct" };
  const c = await ownerContext(user.id, r.vault);
  if ("error" in c) return fail(c.error!);
  return { ok: true, mode: "live", network: networkId(), vault: c.vault, owner: c.owner, calls: callsFor(r.plan, c.owner) };
}

/** Rehearsal, or a payee that isn't on the vault yet: apply in the app only. */
export async function applyDirect(input: OwnerActionInput): Promise<OwnerConfirmed> {
  const user = await requireUser();
  const r = await plan(user.id, input);
  if ("error" in r) return fail(r.error);
  const p = r.plan;
  if (p.onChain || (p.kind !== "remove" && p.kind !== "cap")) return fail("Sign this with your wallet.");
  if (p.kind === "remove") await setPayeeVaultStatus(user.id, p.payee.id, "removed");
  else await setPayeeCap(user.id, p.payee.id, p.cap!);
  await logActivity({
    userId: user.id,
    action: p.kind === "remove" ? "payee.remove" : "payee.cap_change",
    entity: "payee",
    entityId: p.payee.id,
    meta: { nearAccount: p.payee.nearAccount, from: p.payee.capRaw.toString(), to: p.cap?.toString(), onChain: false },
  });
  refresh();
  return { ok: true };
}

/** After the wallet signed (or "Check again"): read the vault and only then record the change. */
export async function confirmOwnerAction(input: OwnerActionInput, txHash?: string): Promise<OwnerConfirmed> {
  const user = await requireUser();
  const r = await plan(user.id, input);
  if ("error" in r) return fail(r.error);
  const p = r.plan;
  if (!p.onChain) return fail("Nothing to confirm on-chain.");
  const c = await ownerContext(user.id, r.vault);
  if ("error" in c) return fail(c.error!);
  const hash = txHash && TX_HASH_RE.test(txHash) ? txHash : undefined;
  try {
    const reader = () => createVaultReader(rpcUrl(), c.vault);
    let ok = false;
    switch (p.kind) {
      case "remove":
        ok = await untilOnChain(async () => removedOnChain(await reader().getPayee(p.payee.nearAccount)));
        break;
      case "cap":
        ok = await untilOnChain(async () => capChangedOnChain(await reader().getPayee(p.payee.nearAccount), p.payee.role, p.cap!));
        break;
      case "limits":
        ok = await untilOnChain(async () => {
          const pol = await reader().getPolicy();
          return limitsOnChain({ dailyLimit: BigInt(pol.daily_limit), payeeDelayNs: BigInt(pol.payee_delay_ns) }, p.dailyLimit, p.payeeDelayNs);
        });
        break;
      case "withdraw": {
        if (!hash) return fail("Couldn't find that withdrawal. Check your wallet's activity.");
        const tx = await fetchTxOutcome(hash, c.owner);
        ok = !!tx && verifyWithdrawn(tx, c.vault, p.amount, c.owner);
        break;
      }
    }
    if (!ok) return { ok: false, retry: true, error: "Your vault doesn't show the change yet. Check again in a moment." };

    if (p.kind === "remove") await setPayeeVaultStatus(user.id, p.payee.id, "removed");
    if (p.kind === "cap") {
      await setPayeeCap(user.id, p.payee.id, p.cap!);
      const chain = await reader().getPayee(p.payee.nearAccount);
      await setPayeeVaultStatus(user.id, p.payee.id, payeeVaultStatus(chain ?? undefined, BigInt(Date.now()) * 1_000_000n));
    }
    // audit trail: the vault's own events from that tx (only a tx the owner signed is fetched)
    if (hash) {
      const tx = await fetchTxOutcome(hash, c.owner);
      if (tx) await recordVaultEvents(user.id, hash, vaultEvents(tx, c.vault));
    }
    await logActivity({ userId: user.id, ...auditEntry(p, c.owner, hash) });
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("[owner-actions.confirm] failed", e);
    return { ok: false, retry: true, error: "Couldn't check your vault. Try again." };
  }
}

function auditEntry(p: Plan, owner: string, txHash: string | undefined) {
  switch (p.kind) {
    case "remove":
    case "cap":
      return {
        action: p.kind === "remove" ? "payee.remove" : "payee.cap_change",
        entity: "payee",
        entityId: p.payee.id,
        meta: { nearAccount: p.payee.nearAccount, from: p.payee.capRaw.toString(), to: p.cap?.toString(), onChain: true, txHash },
      };
    case "limits":
      return { action: "vault.limits_change", entity: "vault", meta: { dailyLimit: p.dailyLimit.toString(), payeeDelayNs: p.payeeDelayNs.toString(), txHash } };
    case "withdraw":
      return { action: "vault.withdraw", entity: "vault", meta: { amount: p.amount.toString(), to: owner, txHash } };
  }
}
