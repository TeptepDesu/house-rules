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
    ["payee.create", { role: "cleaner", nearAccount: "maria.testnet" }, "Added cleaner maria.testnet (needs vault approval)"],
    ["property.create", { name: "Casa Azul" }, "Added property Casa Azul"],
    ["vault.set_account", { vaultAccount: "vault.op.testnet" }, "Connected vault vault.op.testnet"],
    ["agent.run", { trigger: "manual", status: "succeeded", paid: "874000000", rejected: 0 }, "Ran the payout agent: paid $874.00"],
    ["agent.run", { trigger: "cron", status: "partial", paid: "0", rejected: 2 }, "Scheduled payout run: paid $0.00, 2 held back"],
    ["login", {}, "Signed in"],
    ["signup", {}, "Created the account"],
  ])("%s → %s", (action, meta, text) => expect(describeActivity(action, meta)).toBe(text));
});
