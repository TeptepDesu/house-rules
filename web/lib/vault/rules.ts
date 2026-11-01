// Vault policy → plain-language rule cards (design.md principle 4, Ramp-style spend controls).
// Pure: the page feeds it on-chain views.

import { formatUsd } from "@/lib/money";
import type { VaultPayee } from "@/lib/near/policy";

const SEC = 1_000_000_000n;

export function formatDurationNs(ns: bigint): string {
  if (ns <= 0n) return "No waiting period";
  const s = ns / SEC;
  const plural = (n: bigint, unit: string) => `${n} ${unit}${n === 1n ? "" : "s"}`;
  if (s < 60n) return plural(s, "second");
  const m = s / 60n;
  if (m < 60n) return plural(m, "minute");
  const h = m / 60n;
  const rem = m % 60n;
  if (h < 48n) return rem ? `${plural(h, "hour")} ${plural(rem, "minute")}` : plural(h, "hour");
  return plural(h / 24n, "day");
}

export type PayeeState = "pending_signature" | "in_delay" | "active" | "removed";

/** App-side payee status from what the vault says (undefined = not on the vault). */
export function payeeVaultStatus(p: VaultPayee | undefined, nowNs: bigint): PayeeState {
  if (!p) return "pending_signature";
  if (!p.active) return "removed";
  return nowNs >= p.payableFromNs ? "active" : "in_delay";
}

export type RulesInput = {
  policy: { dailyLimit: bigint; payeeDelayNs: bigint; agent: string; owner: string; maxBatch: number };
  payees: VaultPayee[];
  /** account → the operator's name for them (from the app) */
  names: Map<string, string>;
  remainingToday: bigint;
  nowNs: bigint;
};

const ROLE = { owner: "Owner", cleaner: "Cleaner" } as const;

export function describeRules(i: RulesInput) {
  const listed = i.payees.map((p) => ({
    accountId: p.accountId,
    name: i.names.get(p.accountId) ?? p.accountId,
    role: p.role,
    cap: p.capPerPayout,
    payableFromNs: p.payableFromNs,
    status: payeeVaultStatus(p, i.nowNs),
  }));
  const active = listed.filter((p) => p.status !== "removed");
  const n = active.length;
  const maxCap = active.reduce((a, p) => (p.cap > a ? p.cap : a), 0n);
  const capsByRole = (["owner", "cleaner"] as const)
    .map((role) => {
      const caps = active.filter((p) => p.role === role).map((p) => p.cap);
      if (!caps.length) return null;
      const hi = caps.reduce((a, b) => (b > a ? b : a));
      return `${ROLE[role]} up to ${formatUsd(hi)}`;
    })
    .filter(Boolean)
    .join(" · ");

  return {
    allowlist: {
      title: n === 0 ? "Pays no one yet" : n === 1 ? "Pays only this 1 person" : `Pays only these ${n} people`,
      payees: listed,
    },
    cap: { title: n ? `At most ${formatUsd(maxCap)} per payout` : "No payout limits yet", detail: capsByRole },
    daily: { title: `Up to ${formatUsd(i.policy.dailyLimit)} per day`, detail: `${formatUsd(i.remainingToday)} left today` },
    delay: {
      title: i.policy.payeeDelayNs > 0n ? `New payees wait ${formatDurationNs(i.policy.payeeDelayNs)}` : "New payees can be paid right away",
      detail: "Starts when you approve them in the vault, so a hijacked server can't add and pay someone instantly.",
    },
    once: { title: "Each booking is paid once", detail: "The vault remembers every booking it has paid and refuses to pay it again." },
  };
}
