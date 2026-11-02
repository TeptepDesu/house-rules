import { describe, expect, it } from "vitest";
import type { TxOutcome } from "@/lib/near/outcome";
import {
  ONE_YOCTO,
  STORAGE_DEPOSIT_YOCTO,
  capChangeCalls,
  capChangedOnChain,
  limitsOnChain,
  parseLimits,
  removePayeeCalls,
  removedOnChain,
  setLimitsCalls,
  verifyWithdrawn,
  withdrawCalls,
} from "./owner-actions";

const U = 1_000_000n;
const H = 3_600n * 1_000_000_000n;
const payee = (o: Partial<{ active: boolean; capPerPayout: bigint; role: "owner" | "cleaner" }> = {}) => ({
  accountId: "owen.testnet",
  role: "owner" as const,
  capPerPayout: 800n * U,
  payableFromNs: 0n,
  active: true,
  ...o,
});

describe("wallet calls match the contract's owner methods", () => {
  it("remove_payee: 1 yocto (owner-only methods require it)", () => {
    expect(removePayeeCalls("owen.testnet")).toEqual([{ methodName: "remove_payee", args: { account_id: "owen.testnet" }, gas: "30000000000000", deposit: ONE_YOCTO }]);
  });

  it("changing a cap is remove + add in ONE transaction (the contract has no edit; the waiting period restarts)", () => {
    expect(capChangeCalls("owen.testnet", "owner", 900n * U)).toEqual([
      { methodName: "remove_payee", args: { account_id: "owen.testnet" }, gas: "30000000000000", deposit: ONE_YOCTO },
      { methodName: "add_payee", args: { account_id: "owen.testnet", role: "owner", cap_per_payout: "900000000" }, gas: "50000000000000", deposit: STORAGE_DEPOSIT_YOCTO },
    ]);
  });

  it("set_limits and withdraw: amounts as decimal strings, 1 yocto", () => {
    expect(setLimitsCalls(5_000n * U, 24n * H)).toEqual([
      { methodName: "set_limits", args: { daily_limit: "5000000000", payee_delay_ns: "86400000000000" }, gas: "30000000000000", deposit: ONE_YOCTO },
    ]);
    expect(withdrawCalls(126n * U, "op.testnet")).toEqual([
      { methodName: "withdraw", args: { amount: "126000000", receiver_id: "op.testnet" }, gas: "50000000000000", deposit: ONE_YOCTO },
    ]);
  });
});

describe("the server confirms from the chain, never from the browser", () => {
  it("removed / cap changed / limits read back from the vault", () => {
    expect(removedOnChain(payee({ active: false }))).toBe(true);
    expect(removedOnChain(payee())).toBe(false);
    expect(removedOnChain(undefined)).toBe(false);

    expect(capChangedOnChain(payee({ capPerPayout: 900n * U }), "owner", 900n * U)).toBe(true);
    expect(capChangedOnChain(payee({ capPerPayout: 800n * U }), "owner", 900n * U)).toBe(false);
    expect(capChangedOnChain(payee({ capPerPayout: 900n * U, active: false }), "owner", 900n * U)).toBe(false);
    expect(capChangedOnChain(payee({ capPerPayout: 900n * U, role: "cleaner" }), "owner", 900n * U)).toBe(false);

    expect(limitsOnChain({ dailyLimit: 5_000n * U, payeeDelayNs: 24n * H }, 5_000n * U, 24n * H)).toBe(true);
    expect(limitsOnChain({ dailyLimit: 3_000n * U, payeeDelayNs: 24n * H }, 5_000n * U, 24n * H)).toBe(false);
  });

  const tx = (events: { event: string; data: object }[], ok = true, executor = "vault.op.testnet"): TxOutcome =>
    ({
      transaction: { hash: "h" },
      status: { SuccessValue: "" },
      receipts_outcome: [
        {
          id: "r1",
          outcome: {
            executor_id: executor,
            status: ok ? { SuccessValue: "" } : { Failure: {} },
            logs: events.map((e) => `EVENT_JSON:${JSON.stringify({ standard: "houserules", version: "1.0.0", ...e })}`),
          },
        },
      ],
    }) as unknown as TxOutcome;

  it("a withdrawal counts only with the vault's own `withdrawn` event for exactly that amount and receiver", () => {
    const ev = { event: "withdrawn", data: { amount: "126000000", receiver_id: "op.testnet" } };
    expect(verifyWithdrawn(tx([ev]), "vault.op.testnet", 126n * U, "op.testnet")).toBe(true);
    expect(verifyWithdrawn(tx([ev]), "vault.op.testnet", 127n * U, "op.testnet")).toBe(false);
    expect(verifyWithdrawn(tx([ev]), "vault.op.testnet", 126n * U, "thief.testnet")).toBe(false);
    expect(verifyWithdrawn(tx([ev], true, "evil.testnet"), "vault.op.testnet", 126n * U, "op.testnet")).toBe(false); // not from the vault
    expect(verifyWithdrawn(tx([ev], false), "vault.op.testnet", 126n * U, "op.testnet")).toBe(false); // reverted receipt
    expect(verifyWithdrawn(tx([{ event: "withdraw_failed", data: ev.data }]), "vault.op.testnet", 126n * U, "op.testnet")).toBe(false);
  });
});

describe("parseLimits (operator input)", () => {
  it("dollars and hours to raw units", () => {
    expect(parseLimits("5,000", "24")).toEqual({ ok: true, dailyLimit: 5_000n * U, payeeDelayNs: 24n * H });
    expect(parseLimits("250.50", "0")).toEqual({ ok: true, dailyLimit: 250_500_000n, payeeDelayNs: 0n });
  });
  it("rejects nonsense with field-specific messages", () => {
    expect(parseLimits("0", "24")).toMatchObject({ ok: false, field: "daily" });
    expect(parseLimits("abc", "24")).toMatchObject({ ok: false, field: "daily" });
    expect(parseLimits("2000000", "24")).toMatchObject({ ok: false, field: "daily" });
    expect(parseLimits("5000", "-1")).toMatchObject({ ok: false, field: "delay" });
    expect(parseLimits("5000", "1.5")).toMatchObject({ ok: false, field: "delay" });
    expect(parseLimits("5000", "721")).toMatchObject({ ok: false, field: "delay" });
  });
});
