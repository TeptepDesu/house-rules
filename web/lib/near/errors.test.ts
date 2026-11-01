import {
  AccessKeyDepositWithFunctionCallActionError,
  AccessKeyMethodNameMismatchActionError,
  AccessKeyNotEnoughAllowanceActionError,
  AccessKeyReceiverMismatchActionError,
  AccessKeyRequiresFullAccessActionError,
  ContractExecutionError,
} from "near-api-js/rpc-errors";
import { KeyPair } from "near-api-js";
import { describe, expect, it } from "vitest";
import { classifyError, parsePolicyCode } from "./errors";

describe("parsePolicyCode", () => {
  it.each([
    ["Smart contract panicked: POLICY_REJECTED:OverCap", "OverCap"],
    ['HostError(GuestPanic { panic_msg: "POLICY_REJECTED:DailyLimitExceeded" })', "DailyLimitExceeded"],
    ["POLICY_REJECTED:Unauthorized", "Unauthorized"],
  ])("%s → %s", (msg, code) => expect(parsePolicyCode(msg)).toBe(code));

  it.each(["", "Exceeded the prepaid gas", "POLICY_REJECTED:NotARealCode", "policy_rejected:OverCap"])("%j → null", (msg) =>
    expect(parsePolicyCode(msg)).toBeNull(),
  );
});

describe("classifyError (near-api-js 7.4 error classes, as seen in spike #3)", () => {
  const pk = KeyPair.fromRandom("ed25519").getPublicKey();

  it("policy rejection → shown to the operator as a reason", () => {
    const e = new ContractExecutionError("Smart contract panicked: POLICY_REJECTED:PayeeInDelay", "hash", 1);
    expect(classifyError(e)).toEqual({ kind: "policy", code: "PayeeInDelay" });
  });

  it.each([
    ["method mismatch", new AccessKeyMethodNameMismatchActionError("withdraw", null, "", "")],
    ["receiver mismatch", new AccessKeyReceiverMismatchActionError("vault.near", "usdc.near", null, "", "")],
    ["deposit with FC key", new AccessKeyDepositWithFunctionCallActionError(null, "", "")],
    ["requires full access", new AccessKeyRequiresFullAccessActionError(null, "", "")],
  ])("key scope (%s) → misconfigured or compromised agent, never normal", (_, e) => {
    expect(classifyError(e)).toMatchObject({ kind: "key_scope" });
  });

  it("allowance exhausted → top up the agent key", () => {
    const e = new AccessKeyNotEnoughAllowanceActionError("agent.near", 10n, 300n, pk, null, "", "");
    expect(classifyError(e)).toEqual({ kind: "allowance", allowance: 10n, cost: 300n });
  });

  it("anything else → other, with a message (no stack)", () => {
    expect(classifyError(new Error("fetch failed"))).toEqual({ kind: "other", message: "fetch failed" });
    expect(classifyError("boom")).toEqual({ kind: "other", message: "boom" });
  });
});
