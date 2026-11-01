import { describe, expect, it } from "vitest";
import addPayee from "@/test/fixtures/rpc/add-payee.json";
import success from "@/test/fixtures/rpc/settle-success.json";
import type { TxOutcome } from "./outcome";
import { verifyPayeeAdded } from "./payee-approval";

// add-payee.json is a real add_payee outcome recorded from the vault on a sandbox.
const tx = (x: unknown) => x as TxOutcome;

describe("verifyPayeeAdded", () => {
  it("accepts the vault's payee_added for exactly this payee", () => {
    expect(verifyPayeeAdded(tx(addPayee), "vault.test.near", "owen.test.near")).toMatchObject({ ok: true, role: "owner", capPerPayout: 800_000_000n });
  });
  it("rejects a tx that added someone else", () => {
    expect(verifyPayeeAdded(tx(addPayee), "vault.test.near", "mallory.test.near")).toEqual({ ok: false, reason: "wrong_payee" });
  });
  it("rejects a tx from a different contract (a lookalike vault)", () => {
    expect(verifyPayeeAdded(tx(addPayee), "fake-vault.test.near", "owen.test.near")).toEqual({ ok: false, reason: "not_found" });
  });
  it("rejects an unrelated tx (e.g. a settle)", () => {
    expect(verifyPayeeAdded(tx(success), "vault.test.near", "owen.test.near")).toEqual({ ok: false, reason: "not_found" });
  });
  it("rejects a failed tx even if the event text appears in it", () => {
    const failed = structuredClone(addPayee) as unknown as TxOutcome;
    for (const r of failed.receipts_outcome) r.outcome.status = { Failure: {} };
    expect(verifyPayeeAdded(failed, "vault.test.near", "owen.test.near")).toEqual({ ok: false, reason: "not_found" });
  });
});
