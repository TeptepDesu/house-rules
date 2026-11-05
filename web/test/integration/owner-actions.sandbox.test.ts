// The app's owner-action calls (lib/vault/owner-actions.ts) against the REAL vault wasm on a NEAR
// sandbox, signed the way the operator's wallet signs them: one transaction per action, the exact
// method names, args, deposits and gas the app sends. Then the app's own chain checks.

import { actions, nearToYocto, teraToGas } from "near-api-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TxOutcome } from "@/lib/near/outcome";
import { type WalletCall, capChangeCalls, capChangedOnChain, limitsOnChain, removePayeeCalls, removedOnChain, setLimitsCalls, untilOnChain, withdrawCalls, withdrawalOutcome } from "@/lib/vault/owner-actions";
import { type Sandbox, WASM, sandboxAvailable, startSandbox } from "./sandbox";

const U = 1_000_000n;
const H = 3_600n * 1_000_000_000n;
const USDC = "usdc.test.near";
const VAULT = "vault.test.near";
const OPERATOR = "operator.test.near";
const AGENT = "agent.test.near";
const OWEN = "owen.test.near";

describe.skipIf(!sandboxAvailable())("operator's wallet actions on a real vault (sandbox)", () => {
  let sb: Sandbox;
  let vault: typeof import("@/lib/near/vault");
  const reader = () => vault.createVaultReader(sb.rpcUrl, VAULT);
  const sign = (who: string, calls: WalletCall[]) =>
    sb.as(who).signAndSendTransaction({
      receiverId: VAULT,
      actions: calls.map((c) => actions.functionCall(c.methodName, c.args, BigInt(c.gas), BigInt(c.deposit))),
      throwOnFailure: false,
    }) as unknown as Promise<TxOutcome>;
  const failed = (tx: TxOutcome) => typeof tx.status === "object" && tx.status !== null && "Failure" in tx.status;
  const balance = async (who: string) => BigInt(await vault.viewCall<string>(sb.rpcUrl, USDC, "ft_balance_of", { account_id: who }, "optimistic"));

  beforeAll(async () => {
    vault = await import("@/lib/near/vault");
    sb = await startSandbox(3151);
    await sb.makeAccount(USDC, [actions.functionCall("new", {}, teraToGas("50"), 0n)], WASM.ft);
    for (const a of [OPERATOR, AGENT, OWEN]) await sb.makeAccount(a);
    await sb.makeAccount(
      VAULT,
      [actions.functionCall("new", { owner: OPERATOR, agent: AGENT, token: USDC, daily_limit: (3_000n * U).toString(), payee_delay_ns: (24n * H).toString() }, teraToGas("100"), nearToYocto("0.01"))],
      WASM.vault,
    );
    await sb.call(OPERATOR, VAULT, "add_payee", { account_id: OWEN, role: "owner", cap_per_payout: (800n * U).toString() }, nearToYocto("0.01"));
    await sb.call(OPERATOR, USDC, "storage_deposit", { account_id: OPERATOR, registration_only: true }, nearToYocto("0.01"));
    await sb.call(USDC, USDC, "mint", { account_id: VAULT, amount: (1_000n * U).toString() });
  }, 120_000);
  afterAll(() => sb?.stop());

  it("change cap = remove + add in one tx: new cap, still active, waiting period restarted", async () => {
    const before = (await reader().getPayee(OWEN))!;
    const tx = await sign(OPERATOR, capChangeCalls(OWEN, "owner", 900n * U));
    expect(failed(tx)).toBe(false);
    // the app's confirm step: re-read (final finality) until the change shows
    expect(await untilOnChain(async () => capChangedOnChain(await reader().getPayee(OWEN), "owner", 900n * U))).toBe(true);
    expect((await reader().getPayee(OWEN))!.payableFromNs).toBeGreaterThan(before.payableFromNs);
  });

  it("set_limits with 1 yocto: the vault's policy reads back exactly", async () => {
    const tx = await sign(OPERATOR, setLimitsCalls(5_000n * U, 1n * H));
    expect(failed(tx)).toBe(false);
    const shows = async () => {
      const p = await reader().getPolicy(); // a fresh reader each time: getPolicy is cached per reader
      return limitsOnChain({ dailyLimit: BigInt(p.daily_limit), payeeDelayNs: BigInt(p.payee_delay_ns) }, 5_000n * U, 1n * H);
    };
    expect(await untilOnChain(shows)).toBe(true);
  });

  it("withdraw to the operator: tokens move and the app's check finds the vault's `withdrawn` event", async () => {
    const [v0, o0] = [await balance(VAULT), await balance(OPERATOR)];
    const tx = await sign(OPERATOR, withdrawCalls(126n * U, OPERATOR));
    expect(withdrawalOutcome(tx, VAULT, 126n * U, OPERATOR)).toBe("withdrawn");
    expect(withdrawalOutcome(tx, VAULT, 126n * U, AGENT)).toBe("unknown");
    await new Promise((r) => setTimeout(r, 1_500));
    expect(v0 - (await balance(VAULT))).toBe(126n * U);
    expect((await balance(OPERATOR)) - o0).toBe(126n * U);
  });

  it("only the owner can do any of it", async () => {
    for (const calls of [setLimitsCalls(1n, 0n), withdrawCalls(U, OWEN), removePayeeCalls(OWEN), capChangeCalls(OWEN, "owner", 10_000n * U)]) {
      expect(failed(await sign(OWEN, calls))).toBe(true);
    }
    await new Promise((r) => setTimeout(r, 3_000)); // past final-finality lag: nothing changed
    expect(capChangedOnChain(await reader().getPayee(OWEN), "owner", 900n * U)).toBe(true);
  });

  it("remove_payee: the vault stops listing them as active", async () => {
    const tx = await sign(OPERATOR, removePayeeCalls(OWEN));
    expect(failed(tx)).toBe(false);
    expect(await untilOnChain(async () => removedOnChain(await reader().getPayee(OWEN)))).toBe(true);
  });
});
