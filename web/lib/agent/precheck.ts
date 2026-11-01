// Off-chain mirror of the vault's settle checks (docs/vault-spec.md § settle), run before
// anything is sent. Anything rejected here stays pending with a reason and is never submitted.
// Tests mirror contracts/vault/src/tests.rs case for case.

import type { PayoutItem } from "@/lib/splits";
import { MAX_BATCH, MAX_KEY_LEN, type PolicyCode, type VaultPayee } from "@/lib/near/policy";

export type PrecheckReason =
  | Exclude<PolicyCode, "Unauthorized" | "BatchTooLarge">
  | "InsufficientBalance" // vault can't cover it → ask the operator to top up (plan §6C)
  | "SiblingRejected"; // another payout of the same booking failed; bookings are all-or-nothing

export type PrecheckInput = {
  payees: VaultPayee[];
  /** Keys already paid on-chain (vault.is_paid / settled events). */
  paidKeys: ReadonlySet<string>;
  /** vault.remaining_today at plan time. */
  remainingToday: bigint;
  /** Vault's token balance at plan time. */
  vaultBalance: bigint;
  nowNs: bigint;
};

export type PrecheckResult = {
  accepted: PayoutItem[];
  rejected: { item: PayoutItem; reason: PrecheckReason }[];
  acceptedTotal: bigint;
};

const bookingOf = (key: string) => key.split(":")[0];
const keyBytes = (key: string) => new TextEncoder().encode(key).length;

function itemReason(it: PayoutItem, payees: Map<string, VaultPayee>, nowNs: bigint): PrecheckReason | null {
  if (it.amount <= 0n || it.key.length === 0 || keyBytes(it.key) > MAX_KEY_LEN) return "InvalidItem";
  const p = payees.get(it.payee);
  if (!p || !p.active) return "PayeeNotAllowed";
  if (nowNs < p.payableFromNs) return "PayeeInDelay";
  if (it.amount > p.capPerPayout) return "OverCap";
  return null;
}

/**
 * Same rule order as the contract. Bookings are evaluated whole, in input order, and fit
 * greedily into the remaining daily limit and vault balance.
 * AlreadyPaid items are dropped on their own (they don't hold their siblings back).
 */
export function precheck(input: PrecheckInput, items: PayoutItem[]): PrecheckResult {
  const payees = new Map(input.payees.map((p) => [p.accountId, p]));
  const verdict = new Map<number, PrecheckReason | "ok">();
  const seen = new Set<string>();

  // group item indexes by booking, in first-appearance order
  const groups = new Map<string, number[]>();
  items.forEach((it, i) => {
    const b = bookingOf(it.key);
    groups.set(b, [...(groups.get(b) ?? []), i]);
  });

  let budgetDay = input.remainingToday;
  let budgetBalance = input.vaultBalance;
  let acceptedTotal = 0n;

  for (const idxs of groups.values()) {
    const live: number[] = [];
    let failed = false;
    for (const i of idxs) {
      const it = items[i];
      const r = itemReason(it, payees, input.nowNs);
      if (r) {
        verdict.set(i, r);
        failed = true;
      } else if (input.paidKeys.has(it.key) || seen.has(it.key)) {
        verdict.set(i, "AlreadyPaid");
      } else {
        seen.add(it.key);
        live.push(i);
      }
    }
    if (failed) {
      for (const i of live) verdict.set(i, "SiblingRejected");
      continue;
    }
    const total = live.reduce((a, i) => a + items[i].amount, 0n);
    const budget: PrecheckReason | null = total > budgetDay ? "DailyLimitExceeded" : total > budgetBalance ? "InsufficientBalance" : null;
    if (budget) {
      for (const i of live) verdict.set(i, budget);
      continue;
    }
    budgetDay -= total;
    budgetBalance -= total;
    acceptedTotal += total;
    for (const i of live) verdict.set(i, "ok");
  }

  const accepted: PayoutItem[] = [];
  const rejected: PrecheckResult["rejected"] = [];
  items.forEach((item, i) => {
    const v = verdict.get(i)!;
    if (v === "ok") accepted.push(item);
    else rejected.push({ item, reason: v });
  });
  return { accepted, rejected, acceptedTotal };
}

/** Split into settle calls of at most MAX_BATCH items, never splitting a booking across calls. */
export function chunk(items: PayoutItem[], maxBatch = MAX_BATCH): PayoutItem[][] {
  const groups = new Map<string, PayoutItem[]>();
  for (const it of items) {
    const b = bookingOf(it.key);
    groups.set(b, [...(groups.get(b) ?? []), it]);
  }
  const out: PayoutItem[][] = [];
  let cur: PayoutItem[] = [];
  for (const g of groups.values()) {
    if (g.length > maxBatch) throw new Error(`booking ${bookingOf(g[0].key)} has more than ${maxBatch} payouts`);
    if (cur.length + g.length > maxBatch) {
      out.push(cur);
      cur = [];
    }
    cur.push(...g);
  }
  if (cur.length) out.push(cur);
  return out;
}
