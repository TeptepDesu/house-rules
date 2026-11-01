// Plan Nov 7 exit criterion, proven locally: "one click pays owner + cleaner via the agent key".
// Real vault wasm + mock USDC on a NEAR sandbox; real app code (DB on PGlite, planning, run loop,
// vault client); the agent signs with a FUNCTION-CALL key scoped to vault.settle.

import { KeyPair, actions, nearToYocto, teraToGas } from "near-api-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Sandbox, WASM, sandboxAvailable, startSandbox } from "./sandbox";

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;

const U = 1_000_000n;
const USDC = "usdc.test.near";
const VAULT = "vault.test.near";
const OPERATOR = "operator.test.near";
const AGENT = "agent.test.near";
const OWEN = "owen.test.near";
const MARIA = "maria.test.near";

describe.skipIf(!sandboxAvailable())("settlement agent on a real vault (sandbox)", () => {
  let sb: Sandbox;
  let agentKey: string; // function-call key, settle only
  let userId: string;
  let bookingIds: string[] = [];
  const mods = {} as {
    db: typeof import("@/lib/db");
    conn: typeof import("@/lib/db/conn");
    s: typeof import("@/lib/db/schema");
    people: typeof import("@/lib/db/people");
    vault: typeof import("@/lib/near/vault");
    service: typeof import("@/lib/agent/service");
    agentDb: typeof import("@/lib/db/agent");
    load: typeof import("@/lib/vault/load");
    inv: typeof import("@/lib/db/invoices");
  };
    // latest state (optimistic): "final" trails the transfer we just made by a block or two
  const balance = async (who: string) => BigInt(await mods.vault.viewCall<string>(sb.rpcUrl, USDC, "ft_balance_of", { account_id: who }, "optimistic"));

  async function addReadyBooking(ref: string, payout: bigint, propertyId: string) {
    const [b] = await (await mods.conn.db())
      .insert(mods.s.bookings)
      .values({ userId, propertyId, externalRef: ref, channel: "airbnb", collectionMode: "ota_payout", guestName: `Guest ${ref}`, checkIn: "2026-10-01", checkOut: "2026-10-03", expectedGrossRaw: payout, otaPayoutRaw: payout })
      .returning();
    return b.id;
  }

  beforeAll(async () => {
    mods.db = await import("@/lib/db");
    mods.conn = await import("@/lib/db/conn");
    mods.s = await import("@/lib/db/schema");
    mods.people = await import("@/lib/db/people");
    mods.vault = await import("@/lib/near/vault");
    mods.service = await import("@/lib/agent/service");
    mods.agentDb = await import("@/lib/db/agent");
    mods.load = await import("@/lib/vault/load");
    mods.inv = await import("@/lib/db/invoices");

    sb = await startSandbox(3141);
    await sb.makeAccount(USDC, [actions.functionCall("new", {}, teraToGas("50"), 0n)], WASM.ft);
    for (const a of [OPERATOR, AGENT, OWEN, MARIA]) await sb.makeAccount(a);
    await sb.makeAccount(
      VAULT,
      [actions.functionCall("new", { owner: OPERATOR, agent: AGENT, token: USDC, daily_limit: (3_000n * U).toString(), payee_delay_ns: "0" }, teraToGas("100"), nearToYocto("0.01"))],
      WASM.vault,
    );
    // operator (full-access wallet) allowlists payees; mint $1,000 into the vault
    await sb.call(OPERATOR, VAULT, "add_payee", { account_id: OWEN, role: "owner", cap_per_payout: (800n * U).toString() }, nearToYocto("0.01"));
    await sb.call(OPERATOR, VAULT, "add_payee", { account_id: MARIA, role: "cleaner", cap_per_payout: (100n * U).toString() }, nearToYocto("0.01"));
    await sb.call(USDC, USDC, "mint", { account_id: VAULT, amount: (1_000n * U).toString() });

    // the agent's server key: function-call only, vault.settle only
    const fc = KeyPair.fromRandom("ed25519");
    await sb.as(AGENT).signAndSendTransaction({ receiverId: AGENT, actions: [actions.addFunctionCallAccessKey(fc.getPublicKey(), VAULT, ["settle"], nearToYocto("2"))] });
    agentKey = fc.toString();

    // operator's books: Casa Azul ($80 cleaning, 15% mgmt), two $500 OTA payouts, reconciled ready
    userId = (await mods.db.createUser({ email: "op@example.com", name: "Op", passwordHash: "h" }))!.id;
    const owen = await mods.people.createPayee(userId, { name: "Owen", role: "owner", nearAccount: OWEN, capRaw: 800n * U });
    const maria = await mods.people.createPayee(userId, { name: "Maria", role: "cleaner", nearAccount: MARIA, capRaw: 100n * U });
    if (!owen.ok || !maria.ok) throw new Error("setup");
    const prop = await mods.people.createProperty(userId, { name: "Casa Azul", ownerPayeeId: owen.id, cleanerPayeeId: maria.id, cleaningFeeRaw: 80n * U, mgmtFeeBps: 1500 });
    if (!prop.ok) throw new Error("setup");
    bookingIds = [await addReadyBooking("HM1", 500n * U, prop.id), await addReadyBooking("HM2", 500n * U, prop.id)];
  });

  afterAll(() => sb?.stop());

  const agentVault = (key = agentKey) => mods.vault.createAgentVault({ rpcUrl: sb.rpcUrl, vault: VAULT, agentAccount: AGENT, agentPrivateKey: key });

  it("one run pays every owner and cleaner, atomically, with the scoped key", async () => {
    const r = await mods.service.runAgentForUser(userId, "manual", agentVault());
    if (!r.ok) throw new Error(r.message);
    expect(r.outcome.status).toBe("succeeded");
    // per booking: cleaner 80, net 420, mgmt 63 (retained), owner 357
    expect(r.outcome.paidTotal).toBe(2n * 437n * U);
    expect(await balance(OWEN)).toBe(2n * 357n * U);
    expect(await balance(MARIA)).toBe(2n * 80n * U);
    expect(await balance(VAULT)).toBe((1_000n - 874n) * U);
    for (const id of bookingIds) {
      expect(await mods.vault.viewCall<boolean>(sb.rpcUrl, VAULT, "is_paid", { key: `${id}:owner` }, "optimistic")).toBe(true);
    }

    const detail = await mods.agentDb.runDetail(userId, r.runId);
    expect(detail?.txs).toHaveLength(1);
    expect(detail?.txs[0]).toMatchObject({ status: "paid" });
    expect(detail?.splits.filter((s) => s.status === "paid")).toHaveLength(4);
    const [b] = await (await mods.conn.db()).select().from(mods.s.bookings).where((await import("drizzle-orm")).eq(mods.s.bookings.id, bookingIds[0]));
    expect(b.settlementStatus).toBe("settled");
  });

  it("running again pays nothing twice (no transactions at all)", async () => {
    const before = await balance(OWEN);
    const r = await mods.service.runAgentForUser(userId, "manual", agentVault());
    if (!r.ok) throw new Error(r.message);
    expect(r.outcome.chunks).toHaveLength(0);
    expect(await balance(OWEN)).toBe(before);
  });

  it("refuses to run with a FULL-ACCESS key, and pays nothing", async () => {
    const propId = (await mods.people.listProperties(userId))[0].id;
    await addReadyBooking("HM3", 100n * U, propId);
    const before = await balance(VAULT);
    // agent.test.near also has a FULL-ACCESS key (the sandbox root key): the app must refuse it
    const r = await mods.service.runAgentForUser(userId, "manual", agentVault(sb.rootKey));
    if (!r.ok) throw new Error(r.message);
    expect(r.outcome.status).toBe("failed");
    expect(r.outcome.stoppedBecause).toMatchObject({ kind: "key_scope" });
    expect(r.outcome.stoppedBecause && "detail" in r.outcome.stoppedBecause && r.outcome.stoppedBecause.detail).toMatch(/FULL ACCESS/);
    expect(await balance(VAULT)).toBe(before);
  });

  it("a payout over the payee's cap is held back by the pre-check, never sent", async () => {
    const propId = (await mods.people.listProperties(userId))[0].id;
    await addReadyBooking("HM4", 2_000n * U, propId); // owner share ≈ $1,632 > $800 cap
    const r = await mods.service.runAgentForUser(userId, "manual", agentVault());
    if (!r.ok) throw new Error(r.message);
    const held = r.outcome.bookings.find((b) => b.items.some((i) => i.reason === "OverCap"));
    expect(held).toBeDefined();
    expect(held!.status).toBe("pending");
    // HM3 (left unpaid by the refused run) is paid now with the right key
    expect(r.outcome.bookings.filter((b) => b.status === "paid")).toHaveLength(1);
  });

  it("Vault rules page data: live policy + payees from chain, agent key verified, payee statuses synced", async () => {
    Object.assign(process.env, { AGENT_MODE: "live", NEAR_RPC_URL: sb.rpcUrl, AGENT_ACCOUNT: AGENT, AGENT_PRIVATE_KEY: agentKey });
    try {
      await mods.inv.setVaultAccount(userId, VAULT);
      const v = await mods.load.loadVaultView(userId);
      if (v.state !== "ok") throw new Error(v.state);
      expect(v.mode).toBe("live");
      expect(v.policy).toMatchObject({ dailyLimit: 3_000n * U, payeeDelayNs: 0n, agent: AGENT, owner: OPERATOR, tokenRegistered: true });
      expect(v.payees.map((p) => p.accountId).sort()).toEqual([MARIA, OWEN]);
      expect(v.agentKey.ok).toBe(true);
      const statuses = Object.fromEntries((await mods.people.listPayees(userId)).map((p) => [p.nearAccount, p.vaultStatus]));
      expect(statuses).toEqual({ [OWEN]: "active", [MARIA]: "active" }); // synced from chain (were pending_signature)

      process.env.AGENT_PRIVATE_KEY = sb.rootKey; // full access → flagged
      const bad = await mods.load.loadVaultView(userId);
      if (bad.state !== "ok") throw new Error(bad.state);
      expect(bad.agentKey).toMatchObject({ ok: false });
      expect(bad.agentKey.detail).toMatch(/FULL ACCESS/);
    } finally {
      for (const k of ["AGENT_MODE", "NEAR_RPC_URL", "AGENT_ACCOUNT", "AGENT_PRIVATE_KEY"]) delete process.env[k];
    }
  });
});
