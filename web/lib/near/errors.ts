// Turn NEAR / near-api-js errors into something the dashboard can act on (spike #3):
//   policy     → the vault said no; show the reason on the run (expected, part of the product)
//   key_scope  → the agent key tried something outside vault.settle: misconfigured or compromised
//   allowance  → the agent key's gas allowance is exhausted: operator must top it up
//   other      → network/RPC/unknown; message only, never a stack

import {
  AccessKeyDepositWithFunctionCallActionError,
  AccessKeyMethodNameMismatchActionError,
  AccessKeyNotEnoughAllowanceActionError,
  AccessKeyReceiverMismatchActionError,
  AccessKeyRequiresFullAccessActionError,
} from "near-api-js/rpc-errors";
import { POLICY_CODES, type PolicyCode } from "./policy";

export type ClassifiedError =
  | { kind: "policy"; code: PolicyCode }
  | { kind: "key_scope"; detail: string }
  | { kind: "allowance"; allowance: bigint; cost: bigint }
  | { kind: "other"; message: string };

const CODE_RE = /POLICY_REJECTED:([A-Za-z]+)/;

/** The vault's rejection code from any error text, or null. Only known codes count. */
export function parsePolicyCode(text: string): PolicyCode | null {
  const m = CODE_RE.exec(text);
  return m && (POLICY_CODES as readonly string[]).includes(m[1]) ? (m[1] as PolicyCode) : null;
}

const KEY_SCOPE = [
  AccessKeyMethodNameMismatchActionError,
  AccessKeyReceiverMismatchActionError,
  AccessKeyDepositWithFunctionCallActionError,
  AccessKeyRequiresFullAccessActionError,
];

export function classifyError(e: unknown): ClassifiedError {
  if (e instanceof AccessKeyNotEnoughAllowanceActionError) {
    return { kind: "allowance", allowance: e.allowance, cost: e.cost };
  }
  // our own pre-flight refusal (lib/near/vault.ts) counts as a key-scope problem: stop the run
  if (e instanceof Error && e.name === "AgentKeyNotScopedError") return { kind: "key_scope", detail: e.message };
  if (KEY_SCOPE.some((C) => e instanceof C)) {
    return { kind: "key_scope", detail: (e as Error).message };
  }
  const message = e instanceof Error ? e.message : String(e);
  const code = parsePolicyCode(message);
  if (code) return { kind: "policy", code };
  return { kind: "other", message };
}
