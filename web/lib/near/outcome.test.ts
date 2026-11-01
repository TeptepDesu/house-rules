import { describe, expect, it } from "vitest";
import addPayee from "@/test/fixtures/rpc/add-payee.json";
import deployInit from "@/test/fixtures/rpc/vault-deploy-init.json";
import batchFailed from "@/test/fixtures/rpc/settle-batch-failed.json";
import rejected from "@/test/fixtures/rpc/settle-policy-rejected.json";
import success from "@/test/fixtures/rpc/settle-success.json";
import { type TxOutcome, settleResult, vaultEvents } from "./outcome";

// Fixtures are real RPC responses from the real vault on a sandbox (scripts/record-rpc-fixtures.mts).
const VAULT = "vault.test.near";
const tx = (x: unknown) => x as TxOutcome;

describe("vaultEvents", () => {
  it("reads settle_started and settled from a successful settle", () => {
    const ev = vaultEvents(tx(success), VAULT);
    expect(ev.map((e) => e.event)).toEqual(["settle_started", "settled"]);
    expect(ev[1].data).toEqual({ keys: ["bk1:owner", "bk1:cleaner"], total: "350000000" });
    expect(ev[0].receiptId).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it("ignores the token's logs, including ft_transfer logs left on a REVERTED receipt", () => {
    const raw = tx(batchFailed).receipts_outcome.flatMap((r) => r.outcome.logs);
    expect(raw.some((l) => l.includes('"standard":"nep141"'))).toBe(true); // the trap is really there
    const ev = vaultEvents(tx(batchFailed), VAULT);
    expect(ev.map((e) => e.event)).toEqual(["settle_started", "settle_failed"]);
  });

  it("only trusts the vault account it's told about", () => {
    expect(vaultEvents(tx(success), "someone-else.test.near")).toEqual([]);
  });

  it("reads registration and payee events", () => {
    expect(vaultEvents(tx(deployInit), VAULT).map((e) => e.event)).toEqual(["vault_registered"]);
    const [e] = vaultEvents(tx(addPayee), VAULT);
    expect(e.event).toBe("payee_added");
    expect(e.data).toMatchObject({ account_id: "owen.test.near", role: "owner", cap_per_payout: "800000000", payable_from_ns: expect.any(String) });
  });

  it("returns nothing for a policy-rejected (panicked) call", () => {
    expect(vaultEvents(tx(rejected), VAULT)).toEqual([]);
  });
});

describe("settleResult", () => {
  it("paid: callback returned true", () => {
    const r = settleResult(tx(success), VAULT);
    expect(r).toMatchObject({ kind: "paid", keys: ["bk1:owner", "bk1:cleaner"], total: 350_000_000n, txHash: expect.any(String) });
    expect(r.kind === "paid" && r.events?.map((e) => e.event)).toEqual(["settle_started", "settled"]);
  });

  it("reverted: tx 'succeeded' but the callback returned false, so nothing was paid", () => {
    expect(settleResult(tx(batchFailed), VAULT)).toMatchObject({ kind: "reverted", keys: ["bk3:owner", "bk3:cleaner"], total: 15_000_000n, txHash: expect.any(String) });
  });

  it("rejected: policy code parsed from the failed tx", () => {
    expect(settleResult(tx(rejected), VAULT)).toEqual({ kind: "rejected", code: "OverCap", txHash: expect.any(String) });
  });

  it("unknown shapes are 'failed', never 'paid'", () => {
    const weird = { ...tx(success), status: { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: "Exceeded the prepaid gas." } } } } } };
    expect(settleResult(weird as TxOutcome, VAULT)).toMatchObject({ kind: "failed", message: expect.stringContaining("prepaid gas") });
    const noCallback = { ...tx(success), status: { SuccessValue: "" } };
    expect(settleResult(noCallback as TxOutcome, VAULT).kind).toBe("failed");
  });
});
