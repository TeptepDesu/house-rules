// Owner actions on the vault, signed by the operator's own wallet (never the agent's key, which
// can only call settle). Pure: builds the exact calls the contract expects (contracts/vault, all
// owner-only methods except add_payee require exactly 1 yocto) and checks the result read back
// from the chain. The server re-reads the vault after signing; nothing is taken from the browser.

import { type TxOutcome, vaultEvents } from "@/lib/near/outcome";
import type { PayeeRole, VaultPayee } from "@/lib/near/policy";
import { parseUsd } from "@/lib/money";

export type WalletCall = { methodName: string; args: Record<string, string>; gas: string; deposit: string };

export const ONE_YOCTO = "1";
/** 0.01 NEAR: add_payee forwards it to register the payee on the USDC contract. */
export const STORAGE_DEPOSIT_YOCTO = "10000000000000000000000";
const TGAS = (n: number) => `${n}000000000000`;

export const removePayeeCalls = (account: string): WalletCall[] => [{ methodName: "remove_payee", args: { account_id: account }, gas: TGAS(30), deposit: ONE_YOCTO }];

export const addPayeeCall = (account: string, role: PayeeRole, cap: bigint): WalletCall => ({
  methodName: "add_payee",
  args: { account_id: account, role, cap_per_payout: cap.toString() },
  gas: TGAS(50),
  deposit: STORAGE_DEPOSIT_YOCTO,
});

/** The contract has no "edit cap": remove + re-add in one transaction. The waiting period restarts. */
export const capChangeCalls = (account: string, role: PayeeRole, cap: bigint): WalletCall[] => [...removePayeeCalls(account), addPayeeCall(account, role, cap)];

export const setLimitsCalls = (dailyLimit: bigint, payeeDelayNs: bigint): WalletCall[] => [
  { methodName: "set_limits", args: { daily_limit: dailyLimit.toString(), payee_delay_ns: payeeDelayNs.toString() }, gas: TGAS(30), deposit: ONE_YOCTO },
];

export const withdrawCalls = (amount: bigint, receiver: string): WalletCall[] => [
  { methodName: "withdraw", args: { amount: amount.toString(), receiver_id: receiver }, gas: TGAS(50), deposit: ONE_YOCTO },
];

export const removedOnChain = (p: VaultPayee | null | undefined) => !!p && !p.active;
export const capChangedOnChain = (p: VaultPayee | null | undefined, role: PayeeRole, cap: bigint) => !!p && p.active && p.role === role && p.capPerPayout === cap;
export const limitsOnChain = (policy: { dailyLimit: bigint; payeeDelayNs: bigint }, dailyLimit: bigint, payeeDelayNs: bigint) =>
  policy.dailyLimit === dailyLimit && policy.payeeDelayNs === payeeDelayNs;

export type WithdrawalOutcome = "withdrawn" | "failed" | "unknown";

/**
 * Read from the vault's own events only, on a successful receipt, for exactly this amount + receiver.
 * "failed" is final: on_withdrawn logs withdraw_failed when the transfer bounced (typically a wallet
 * not registered on USDC), inside a transaction that itself succeeds, so the money never left.
 */
export function withdrawalOutcome(tx: TxOutcome, vault: string, amount: bigint, receiver: string): WithdrawalOutcome {
  const mine = vaultEvents(tx, vault).filter((e) => String(e.data.amount) === amount.toString() && e.data.receiver_id === receiver);
  if (mine.some((e) => e.event === "withdrawn")) return "withdrawn";
  return mine.some((e) => e.event === "withdraw_failed") ? "failed" : "unknown";
}

const MAX_DAILY = 1_000_000n * 1_000_000n;
const MAX_DELAY_MIN = 43_200n; // 30 days
const MINUTE_NS = 60n * 1_000_000_000n;

export type ParsedLimits = { ok: true; dailyLimit: bigint; payeeDelayNs: bigint } | { ok: false; field: "daily" | "delay"; error: string };

/** The vault's wait for the form, rounded up so that saving the form can never shorten it. */
export const delayMinutesInput = (ns: bigint) => ((ns + MINUTE_NS - 1n) / MINUTE_NS).toString();

export function parseLimits(dailyUsd: string, delayMinutes: string): ParsedLimits {
  let daily: bigint;
  try {
    daily = parseUsd(dailyUsd);
  } catch {
    return { ok: false, field: "daily", error: "Enter a dollar amount, e.g. 5,000" };
  }
  if (daily <= 0n || daily > MAX_DAILY) return { ok: false, field: "daily", error: "Enter between $0.01 and $1,000,000" };
  const m = delayMinutes.trim();
  if (!/^\d+$/.test(m) || BigInt(m) > MAX_DELAY_MIN) return { ok: false, field: "delay", error: "Enter whole minutes from 0 to 43,200 (30 days)" };
  return { ok: true, dailyLimit: daily, payeeDelayNs: BigInt(m) * MINUTE_NS };
}

/**
 * Re-read until the chain shows the change: the vault is read at "final" finality, which trails a
 * just-signed transaction by a couple of blocks (spike #1). Gives up after ~8s; the UI then offers
 * "Check again" without asking the wallet to sign twice.
 */
export async function untilOnChain(check: () => Promise<boolean>, tries = 6, waitMs = 1_500): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await check()) return true;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, waitMs));
  }
  return false;
}
