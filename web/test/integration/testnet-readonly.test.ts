// Read-only checks against PUBLIC NEAR testnet, using real txs from docs/testnet-deployment.md.
// No keys, no writes. Proves the app's RPC fetch + verifiers on the real network, not just a sandbox.

import { describe, expect, it } from "vitest";

const RPC = "https://rpc.testnet.near.org";
// These txs are from Nov 2026 and regular nodes prune history after a few days, so old txs need an archival node.
const ARCHIVAL_RPC = "https://archival-rpc.testnet.near.org";
const VAULT = "vault.houserules-operator.testnet";
const OPERATOR = "houserules-operator.testnet";

describe("public testnet (read-only)", () => {
  it("the operator's wallet-signed add_payee for owner-1 verifies, and nothing else does", async () => {
    process.env.NEAR_RPC_URL = ARCHIVAL_RPC;
    const { fetchTxOutcome } = await import("@/lib/near/rpc");
    const { verifyPayeeAdded } = await import("@/lib/near/payee-approval");
    const tx = await fetchTxOutcome("EyLo6na9gnReu4jkmiCha6kQhW9uwap96Vmtd7BUaHQP", OPERATOR);
    expect(tx).not.toBeNull();
    expect(verifyPayeeAdded(tx!, VAULT, "houserules-owner-1.testnet")).toMatchObject({ ok: true, role: "owner", capPerPayout: 800_000_000n });
    expect(verifyPayeeAdded(tx!, VAULT, "houserules-cleaner-1.testnet")).toEqual({ ok: false, reason: "wrong_payee" });
    delete process.env.NEAR_RPC_URL;
  });

  it("the testnet payout tx parses as paid, with the vault's events, via the app's parser", async () => {
    process.env.NEAR_RPC_URL = ARCHIVAL_RPC;
    const { fetchTxOutcome } = await import("@/lib/near/rpc");
    const { settleResult, vaultEvents } = await import("@/lib/near/outcome");
    const tx = await fetchTxOutcome("5zJgtUU7UyyCJrg9ynVgWoggPRTKLT5ctZahckM5Gqas", OPERATOR);
    expect(settleResult(tx!, VAULT)).toMatchObject({ kind: "paid", keys: ["demo-bk1:owner", "demo-bk1:cleaner"], total: 9_200_000n });
    expect(vaultEvents(tx!, VAULT).map((e) => e.event)).toEqual(["settle_started", "settled"]);
    delete process.env.NEAR_RPC_URL;
  });

  it("the agent's key on testnet is scoped to vault.settle (the app's own check passes)", async () => {
    const { assertAgentKeyScoped } = await import("@/lib/near/vault");
    await expect(assertAgentKeyScoped(RPC, "houserules-agent.testnet", "ed25519:BkN4MTEq7Hok3EFu5pJKAFy5HZcXtgSJmn38BCG1kU8K", VAULT)).resolves.toBeUndefined();
  });
});
