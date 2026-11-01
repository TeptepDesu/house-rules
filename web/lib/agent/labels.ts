// Plain-language reasons for payouts the agent couldn't make (design.md § Writing).
const REASONS: Record<string, string> = {
  // vault policy (on-chain codes, also used by the pre-check)
  PayeeNotAllowed: "Payee isn't approved in your vault",
  PayeeInDelay: "Payee is still in the new-payee waiting period",
  OverCap: "Above this payee's per-payout limit",
  AlreadyPaid: "Already paid",
  DailyLimitExceeded: "Over today's payout limit",
  InvalidItem: "Invalid payout amount",
  BatchTooLarge: "Too many payouts in one batch",
  Unauthorized: "The agent isn't authorized on this vault",
  // pre-check / run
  InsufficientBalance: "Not enough USDC in the vault: top it up",
  SiblingRejected: "Held with the rest of this booking",
  BatchReverted: "A transfer failed, so nothing in that batch was paid",
  SettleFailed: "The payout transaction failed",
  RunStopped: "The run stopped before this payout",
  key_scope: "The agent key is misconfigured",
  allowance: "The agent key needs a gas top-up",
  other: "Network problem; it'll be retried",
  // setup
  no_property: "Booking has no property",
  no_owner_payee: "Property has no owner payee",
  no_cleaner_payee: "Property has no cleaner payee",
};

export const reasonLabel = (code: string | null | undefined) => (code ? (REASONS[code] ?? code) : "");
