// Mirrors of the vault's on-chain constants and codes. Source of truth: docs/vault-spec.md.
// If you change one here, change contracts/vault/src/lib.rs and both test suites.

export const MAX_BATCH = 40;
export const MAX_KEY_LEN = 64;
export const WINDOW_NS = 24n * 60n * 60n * 1_000_000_000n;

export const POLICY_CODES = [
  "Unauthorized",
  "BatchTooLarge",
  "InvalidItem",
  "PayeeNotAllowed",
  "PayeeInDelay",
  "OverCap",
  "AlreadyPaid",
  "DailyLimitExceeded",
] as const;
export type PolicyCode = (typeof POLICY_CODES)[number];

export type PayeeRole = "owner" | "cleaner";

/** A payee as the vault reports it (get_payees), with amounts/times parsed to bigint. */
export type VaultPayee = {
  accountId: string;
  role: PayeeRole;
  capPerPayout: bigint;
  payableFromNs: bigint;
  active: boolean;
};

/** Gas to attach to a settle call with n items (spike #3: attach per chunk, not a flat 300). */
export function settleGasTgas(n: number): number {
  return Math.min(300, 30 + 6 * n);
}
