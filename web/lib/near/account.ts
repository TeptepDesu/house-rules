import type { NetworkId } from "./network";

// NEAR account id rules: 2–64 chars; lowercase a–z, 0–9; separators - _ . never leading,
// trailing or doubled. 64-char lowercase hex = implicit account.
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const IMPLICIT_RE = /^[0-9a-f]{64}$/;

export function isValidAccountId(a: string): boolean {
  return a.length >= 2 && a.length <= 64 && ACCOUNT_RE.test(a);
}

/** null if OK; otherwise a message an operator can act on. Guards against testnet/mainnet mix-ups. */
export function checkAccountForNetwork(a: string, network: NetworkId): string | null {
  if (!isValidAccountId(a)) return "Enter a valid NEAR account, like maria.testnet";
  if (IMPLICIT_RE.test(a)) return null;
  if (network === "testnet" && !a.endsWith(".testnet")) return "This app is on testnet: use a .testnet account";
  if (network === "mainnet" && a.endsWith(".testnet")) return "This app is on mainnet: .testnet accounts can't receive real payouts";
  return null;
}
