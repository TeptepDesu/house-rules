// Audit log rows as plain sentences (design.md § Writing). Pure.
import { formatUsd } from "@/lib/money";
import { formatDurationNs } from "@/lib/vault/rules";

const usd = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? formatUsd(BigInt(v)) : "?");
const n = (v: unknown) => (Array.isArray(v) ? v.length : 0);
const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"}`;

export function describeVaultEvent(event: string, d: Record<string, unknown>, names: Map<string, string>): string {
  const who = (a: unknown) => (typeof a === "string" ? (names.get(a) ?? a) : "?");
  switch (event) {
    case "settle_started":
      return `Payout batch sent: ${plural(n(d.items), "payout")}, ${usd(d.total)}`;
    case "settled":
      return `Paid ${usd(d.total)} in ${plural(n(d.keys), "payout")}`;
    case "settle_failed":
      return "Payout batch reverted: nothing was paid";
    case "payee_added":
      return `Payee approved: ${who(d.account_id)} (${String(d.role)}), up to ${usd(d.cap_per_payout)} per payout`;
    case "payee_removed":
      return `Payee removed: ${who(d.account_id)}`;
    case "limits_changed":
      return `Limits changed: ${usd(d.daily_limit)} per day, new payees wait ${typeof d.payee_delay_ns === "string" ? formatDurationNs(BigInt(d.payee_delay_ns)) : "?"}`;
    case "agent_changed":
      return `Agent changed from ${String(d.old)} to ${String(d.new)}`;
    case "withdrawn":
      return `Withdrew ${usd(d.amount)} to ${who(d.receiver_id)}`;
    case "withdraw_failed":
      return `Withdrawal of ${usd(d.amount)} to ${who(d.receiver_id)} failed: funds stayed in the vault`;
    case "vault_registered":
      return `Vault registered to hold ${String(d.token)}`;
    case "vault_registration_failed":
      return `Vault couldn't register with ${String(d.token)}: guest payments can't land yet`;
    default:
      return event;
  }
}

const FORMAT: Record<string, string> = { airbnb: "an Airbnb payout report", booking_com: "a Booking.com statement", guesty: "a Guesty export", manual: "a payout report" };

export function describeActivity(action: string, m: Record<string, unknown>): string {
  switch (action) {
    case "import.confirm":
      return `Imported ${FORMAT[String(m.format)] ?? "a payout report"}: ${plural(Number(m.created ?? 0), "booking")} added${Number(m.updated) ? `, ${Number(m.updated)} updated` : ""}`;
    case "invoice.create":
      return `Charged a guest ${usd(m.amount)}`;
    case "invoice.waive":
      return `Waived a ${usd(m.amount)} charge${m.description ? `: ${String(m.description)}` : ""}`;
    case "payee.create":
      return `Added ${String(m.role)} ${String(m.nearAccount)} (needs vault approval)`;
    case "payee.approve":
      return `Approved ${String(m.nearAccount)} in the vault (signed with your wallet)`;
    case "payee.remove":
      return `Removed ${String(m.nearAccount)} from the vault${m.onChain ? " (signed with your wallet)" : ""}`;
    case "payee.cap_change":
      return `Changed ${String(m.nearAccount)}'s limit from ${usd(m.from)} to ${usd(m.to)}${m.onChain ? " (signed with your wallet; waiting period restarted)" : ""}`;
    case "vault.limits_change":
      return `Set the daily limit to ${usd(m.dailyLimit)} and the new-payee wait to ${Number(BigInt(String(m.payeeDelayNs)) / 3_600_000_000_000n)} hours (signed with your wallet)`;
    case "vault.withdraw":
      return `Withdrew ${usd(m.amount)} to ${String(m.to)} (signed with your wallet)`;
    case "payee.approve_rehearsal":
      return `Approved ${String(m.nearAccount)} (rehearsal, not on-chain)`;
    case "property.create":
      return `Added property ${String(m.name)}`;
    case "vault.set_account":
      return `Connected vault ${String(m.vaultAccount)}`;
    case "agent.run": {
      const held = Number(m.rejected ?? 0);
      return `${m.trigger === "cron" ? "Scheduled payout run" : "Ran the payout agent"}: paid ${usd(m.paid)}${held ? `, ${held} held back` : ""}`;
    }
    case "login":
      return "Signed in";
    case "signup":
      return "Created the account";
    default:
      return action;
  }
}
