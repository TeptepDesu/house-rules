import { describe, expect, it } from "vitest";
import { describeActivity, describeVaultEvent } from "./describe";

const names = new Map([["owen.testnet", "Owen Reyes"]]);

describe("describeVaultEvent", () => {
  it.each([
    ["settle_started", { items: [{}, {}, {}, {}], total: "874000000" }, "Payout batch sent: 4 payouts, $874.00"],
    ["settled", { keys: ["a", "b"], total: "874000000" }, "Paid $874.00 in 2 payouts"],
    ["settle_failed", { keys: ["a"], total: "5" }, "Payout batch reverted: nothing was paid"],
    ["payee_added", { account_id: "owen.testnet", role: "owner", cap_per_payout: "800000000" }, "Payee approved: Owen Reyes (owner), up to $800.00 per payout"],
    ["payee_removed", { account_id: "x.testnet" }, "Payee removed: x.testnet"],
    ["limits_changed", { daily_limit: "3000000000", payee_delay_ns: "86400000000000" }, "Limits changed: $3,000.00 per day, new payees wait 24 hours"],
    ["agent_changed", { old: "a.testnet", new: "b.testnet" }, "Agent changed from a.testnet to b.testnet"],
    ["withdrawn", { amount: "10000000", receiver_id: "owen.testnet" }, "Withdrew $10.00 to Owen Reyes"],
    ["withdraw_failed", { amount: "10000000", receiver_id: "x.testnet" }, "Withdrawal of $10.00 to x.testnet failed: funds stayed in the vault"],
    ["vault_registered", { token: "usdc.testnet" }, "Vault registered to hold usdc.testnet"],
    ["something_new", {}, "something_new"],
  ])("%s → %s", (event, data, text) => expect(describeVaultEvent(event, data as Record<string, unknown>, names)).toBe(text));
});

describe("describeActivity", () => {
  it.each([
    ["import.confirm", { format: "airbnb", created: 22, updated: 0 }, "Imported an Airbnb payout report: 22 bookings added"],
    ["invoice.create", { type: "penalty", amount: "200000000" }, "Charged a guest $200.00"],
    ["invoice.waive", { amount: "45000000", description: "Late checkout" }, "Waived a $45.00 charge: Late checkout"],
    ["booking.accept_payout", { amount: "474700000", delta: "-20000000" }, "Accepted $474.70 as final for a booking ($20.00 short)"],
    ["booking.create_direct", { ref: "D-7KQ2MX", amount: "600000000" }, "Created direct booking D-7KQ2MX and its $600.00 invoice"],
    ["followup.polish", { used: true }, "Reworded a guest message with NEAR AI (private inference)"],
    ["followup.polish", { used: false }, "NEAR AI's rewording changed the facts, so the template was kept"],
    ["payee.remove", { nearAccount: "owen.testnet", onChain: true }, "Removed owen.testnet from the vault (signed with your wallet)"],
    ["payee.cap_change", { nearAccount: "owen.testnet", from: "800000000", to: "900000000", onChain: true }, "Changed owen.testnet's limit from $800.00 to $900.00 (signed with your wallet; waiting period restarted)"],
    ["payee.cap_change", { nearAccount: "owen.testnet", from: "800000000", to: "900000000", onChain: false }, "Changed owen.testnet's limit from $800.00 to $900.00"],
    ["vault.limits_change", { dailyLimit: "5000000000", payeeDelayNs: "86400000000000" }, "Set the daily limit to $5,000.00 and the new-payee wait to 24 hours (signed with your wallet)"],
    ["vault.withdraw", { amount: "126000000", to: "op.testnet" }, "Withdrew $126.00 to op.testnet (signed with your wallet)"],
    ["payee.create", { role: "cleaner", nearAccount: "maria.testnet" }, "Added cleaner maria.testnet (needs vault approval)"],
    ["payee.statement_link", { name: "Maria Lopez", nearAccount: "maria.testnet" }, "Shared Maria Lopez's payout statement link (maria.testnet)"],
    ["property.create", { name: "Casa Azul" }, "Added property Casa Azul"],
    ["payee.approve", { nearAccount: "owen.testnet" }, "Approved owen.testnet in the vault (signed with your wallet)"],
    ["payee.approve_rehearsal", { nearAccount: "owen.testnet" }, "Approved owen.testnet (rehearsal, not on-chain)"],
    ["vault.set_account", { vaultAccount: "vault.op.testnet" }, "Connected vault vault.op.testnet"],
    ["agent.run", { trigger: "manual", status: "succeeded", paid: "874000000", rejected: 0 }, "Ran the payout agent: paid $874.00"],
    ["agent.run", { trigger: "cron", status: "partial", paid: "0", rejected: 2 }, "Scheduled payout run: paid $0.00, 2 held back"],
    ["login", {}, "Signed in"],
    ["signup", {}, "Created the account"],
  ])("%s → %s", (action, meta, text) => expect(describeActivity(action, meta)).toBe(text));
});
