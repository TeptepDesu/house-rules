// Rehearsal vault: stands in for the on-chain vault when AGENT_MODE=mock (local dev, the README
// walkthrough). It applies the same rules as contracts/vault, in the same order
// (docs/vault-spec.md), so rehearsal never pays something the real vault would refuse:
//   BatchTooLarge → InvalidItem → PayeeNotAllowed → OverCap → AlreadyPaid → DailyLimitExceeded
// A refused batch pays nothing (the real settle panics as a whole).
// Differences, labelled in the UI: approval is instant (no wallet, no 24-hour wait) and there's
// no token balance.

import type { AgentVault } from "@/lib/agent/run";
import { MAX_BATCH, MAX_KEY_LEN, type PolicyCode, type VaultPayee, WINDOW_NS } from "@/lib/near/policy";

export const REHEARSAL_DAILY_LIMIT = 20_000n * 1_000_000n;
export const REHEARSAL_DELAY_NS = 24n * 3_600n * 1_000_000_000n;
const REHEARSAL_BALANCE = 1_000_000n * 1_000_000n;

type Window = { startNs: bigint; spent: bigint };
export type RehearsalStore = { paid: Set<string>; windows: Map<string, Window> };

export const newRehearsalStore = (): RehearsalStore => ({ paid: new Set(), windows: new Map() });

/** One store per server process (survives dev hot reloads and separate route bundles). */
export function sharedRehearsalStore(): RehearsalStore {
  const g = globalThis as unknown as { __hrRehearsal?: RehearsalStore };
  return (g.__hrRehearsal ??= newRehearsalStore());
}

export type RehearsalPayee = { nearAccount: string; role: "owner" | "cleaner"; capRaw: bigint; vaultStatus: "pending_signature" | "in_delay" | "active" | "removed" };

const current = (store: RehearsalStore, userId: string, now: bigint): Window => {
  const w = store.windows.get(userId);
  return w && now < w.startNs + WINDOW_NS ? w : { startNs: now, spent: 0n };
};

/** What the operator's daily limit has left right now (same rolling window as the contract). */
export function rehearsalRemaining(store: RehearsalStore, userId: string, now: bigint): bigint {
  const left = REHEARSAL_DAILY_LIMIT - current(store, userId, now).spent;
  return left > 0n ? left : 0n;
}

export function createRehearsalVault(userId: string, listPayees: () => Promise<RehearsalPayee[]>, store: RehearsalStore, nowNs: () => bigint): AgentVault {
  let n = 0;
  const approved = async (): Promise<VaultPayee[]> =>
    (await listPayees())
      .filter((p) => p.vaultStatus === "active")
      .map((p) => ({ accountId: p.nearAccount, role: p.role, capPerPayout: p.capRaw, payableFromNs: 0n, active: true }));

  return {
    getPayees: approved,
    remainingToday: async () => rehearsalRemaining(store, userId, nowNs()),
    balance: async () => REHEARSAL_BALANCE,
    paidKeys: async (keys) => new Set(keys.filter((k) => store.paid.has(k))),
    async settle(items) {
      const now = nowNs();
      const txHash = `mock-settle-${Date.now().toString(36)}-${++n}`;
      const reject = (code: PolicyCode) => ({ kind: "rejected" as const, code, txHash });

      if (items.length === 0 || items.length > MAX_BATCH) return reject("BatchTooLarge");
      const list = new Map((await approved()).map((p) => [p.accountId, p]));
      const keys = new Set<string>();
      for (const i of items) {
        if (i.amount <= 0n || i.key.length === 0 || i.key.length > MAX_KEY_LEN) return reject("InvalidItem");
        const p = list.get(i.payee);
        if (!p) return reject("PayeeNotAllowed");
        if (i.amount > p.capPerPayout) return reject("OverCap");
        if (store.paid.has(i.key) || keys.has(i.key)) return reject("AlreadyPaid");
        keys.add(i.key);
      }
      const total = items.reduce((a, i) => a + i.amount, 0n);
      const w = current(store, userId, now);
      if (w.spent + total > REHEARSAL_DAILY_LIMIT) return reject("DailyLimitExceeded");

      items.forEach((i) => store.paid.add(i.key));
      store.windows.set(userId, { startNs: w.startNs, spent: w.spent + total });
      const wire = items.map((i) => ({ key: i.key, payee: i.payee, amount: i.amount.toString() }));
      // same event shapes the real vault emits (docs/vault-spec.md), so the audit log looks identical
      const events = [
        { event: "settle_started", data: { items: wire, total: total.toString() }, receiptId: `${txHash}-r1` },
        { event: "settled", data: { keys: [...keys], total: total.toString() }, receiptId: `${txHash}-r2` },
      ];
      return { kind: "paid", keys: [...keys], total, txHash, events };
    },
  };
}
