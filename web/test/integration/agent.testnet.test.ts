// LIVE on NEAR testnet (docs/testnet-deployment.md): the app's real agent code pays the testnet
// payees through the deployed vault with the settle-only key. Runs only when the testnet env is
// loaded (pnpm test:testnet, which reads web/.env.testnet.local); skipped otherwise.
// Testnet + mock USDC only: no real money.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const live = process.env.NEAR_NETWORK === "testnet" && process.env.AGENT_MODE === "live" && !!process.env.AGENT_PRIVATE_KEY;
const VAULT = "vault.houserules-operator.testnet";
const USDC = "usdc.houserules-operator.testnet";
const OWNER = "houserules-owner-1.testnet";
const CLEANER = "houserules-cleaner-1.testnet";
const U = 1_000_000n;

describe.skipIf(!live)("settlement agent on the TESTNET vault", () => {
  process.env.PGLITE_DIR = "memory://";
  delete process.env.DATABASE_URL;
  let userId: string;
  let mods: {
    db: typeof import("@/lib/db");
    people: typeof import("@/lib/db/people");
    conn: typeof import("@/lib/db/conn");
    s: typeof import("@/lib/db/schema");
    inv: typeof import("@/lib/db/invoices");
    factory: typeof import("@/lib/agent/vault-factory");
    service: typeof import("@/lib/agent/service");
    vault: typeof import("@/lib/near/vault");
    rpc: typeof import("@/lib/near/rpc");
  };
  const balance = async (who: string) => BigInt(await mods.vault.viewCall<string>(mods.rpc.rpcUrl(), USDC, "ft_balance_of", { account_id: who }, "optimistic"));

  beforeAll(async () => {
    mods = {
      db: await import("@/lib/db"),
      people: await import("@/lib/db/people"),
      conn: await import("@/lib/db/conn"),
      s: await import("@/lib/db/schema"),
      inv: await import("@/lib/db/invoices"),
      factory: await import("@/lib/agent/vault-factory"),
      service: await import("@/lib/agent/service"),
      vault: await import("@/lib/near/vault"),
      rpc: await import("@/lib/near/rpc"),
    };
    userId = (await mods.db.createUser({ email: `testnet.${Date.now()}@example.com`, name: "Testnet Op", passwordHash: "h" }))!.id;
    const o = await mods.people.createPayee(userId, { name: "Owner 1", role: "owner", nearAccount: OWNER, capRaw: 800n * U });
    const c = await mods.people.createPayee(userId, { name: "Cleaner 1", role: "cleaner", nearAccount: CLEANER, capRaw: 100n * U });
    if (!o.ok || !c.ok) throw new Error("setup");
    const p = await mods.people.createProperty(userId, { name: "Casa Testnet", ownerPayeeId: o.id, cleanerPayeeId: c.id, cleaningFeeRaw: 2n * U, mgmtFeeBps: 1000 });
    if (!p.ok) throw new Error("setup");
    await (await mods.conn.db())
      .insert(mods.s.bookings)
      .values({ userId, propertyId: p.id, externalRef: `TN-${Date.now()}`, channel: "airbnb", collectionMode: "ota_payout", guestName: "Testnet Guest", checkIn: "2026-10-01", checkOut: "2026-10-03", expectedGrossRaw: 10n * U, otaPayoutRaw: 10n * U });
    await mods.inv.setVaultAccount(userId, VAULT);
    // the operator's wallet link (NEP-413) is covered in agent.sandbox.test.ts; here we record its result
    await mods.db.setOperatorAccount(userId, "houserules-operator.testnet");
  });
  afterAll(() => undefined);

  it("one run pays owner-1 and cleaner-1 through the vault with the scoped key", async () => {
    const setup = await mods.factory.agentVaultFor(userId);
    if (!setup.ok) throw new Error(setup.reason);
    expect(setup.mode).toBe("live");
    const [o0, c0, v0] = [await balance(OWNER), await balance(CLEANER), await balance(VAULT)];

    const r = await mods.service.runAgentForUser(userId, "manual", setup.vault);
    if (!r.ok) throw new Error(r.message);
    console.log("[testnet] run:", r.outcome.status, "tx:", r.outcome.chunks.map((c) => ("txHash" in c.result ? c.result.txHash : c.result.kind)).join(", "));
    expect(r.outcome.status).toBe("succeeded");

    // $10 collected, $2 cleaning, 10% mgmt → cleaner $2, mgmt $0.80 (kept), owner $7.20
    await new Promise((res) => setTimeout(res, 2_000));
    expect((await balance(OWNER)) - o0).toBe(7_200_000n);
    expect((await balance(CLEANER)) - c0).toBe(2_000_000n);
    expect(v0 - (await balance(VAULT))).toBe(9_200_000n);
  });
});
