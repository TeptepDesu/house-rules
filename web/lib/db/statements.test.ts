import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
const db = await import("./index");
const people = await import("./people");
const st = await import("./statements");
const { db: conn } = await import("./conn");
const s = await import("./schema");

const U = 1_000_000n;
let a: string, b: string, owen: string, maria: string;

/** One booking with an owner split (paid in a real tx) and a cleaner split (held), plus the operator's share. */
async function bookingWithSplits(userId: string, ref: string, o: { owner: string; cleaner: string }) {
  const d = await conn();
  const prop = await people.createProperty(userId, { name: `Home ${ref}`, cleaningFeeRaw: U, mgmtFeeBps: 1500 });
  if (!prop.ok) throw new Error("property");
  const [bk] = await d
    .insert(s.bookings)
    .values({ userId, propertyId: prop.id, externalRef: ref, channel: "airbnb", collectionMode: "ota_payout", guestName: "Ana Reyes", checkIn: "2026-11-01", checkOut: "2026-11-03", expectedGrossRaw: 8n * U })
    .returning();
  const [run] = await d.insert(s.agentRuns).values({ userId, trigger: "manual", status: "partial" }).returning();
  const [tx] = await d.insert(s.settlementTxs).values({ agentRunId: run.id, chunkIndex: 0, txHash: `hash-${ref}`, status: "paid" }).returning();
  await d.insert(s.payoutSplits).values([
    { bookingId: bk.id, role: "owner", payeeId: o.owner, amountRaw: 5_737_500n, vaultKey: `${bk.id}:owner`, settlementTxId: tx.id, status: "paid" },
    { bookingId: bk.id, role: "cleaner", payeeId: o.cleaner, amountRaw: U, vaultKey: `${bk.id}:cleaner`, status: "rejected", reason: "OverCap" },
    { bookingId: bk.id, role: "manager", amountRaw: 1_012_500n, vaultKey: `${bk.id}:manager`, status: "retained" },
  ]);
}

beforeEach(async () => {
  db.__resetDbForTests();
  a = (await db.createUser({ email: "a@x.com", name: "Casa Hosts", passwordHash: "h" }))!.id;
  b = (await db.createUser({ email: "b@x.com", name: "Other Co", passwordHash: "h" }))!.id;
  const o = await people.createPayee(a, { name: "Owen Marsh", role: "owner", nearAccount: "owen.testnet", capRaw: 7n * U });
  const m = await people.createPayee(a, { name: "Maria Lopez", role: "cleaner", nearAccount: "maria.testnet", capRaw: 2n * U });
  if (!o.ok || !m.ok) throw new Error("payees");
  owen = o.id;
  maria = m.id;
});

describe("statement links", () => {
  it("one unguessable link per payee, created on first share and the same after", async () => {
    const first = await st.statementLink(a, owen);
    expect(first).toMatchObject({ created: true, payeeName: "Owen Marsh", nearAccount: "owen.testnet" });
    expect(first!.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await st.statementLink(a, owen)).toMatchObject({ token: first!.token, created: false }); // re-copying changes nothing
    expect((await st.statementLink(a, maria))!.token).not.toBe(first!.token);
  });

  it("an operator can't make a link for someone else's payee", async () => {
    expect(await st.statementLink(b, owen)).toBeNull();
  });
});

describe("payee statement", () => {
  it("shows only this payee's payouts, never the operator's share or another payee's", async () => {
    await bookingWithSplits(a, "HM1", { owner: owen, cleaner: maria });
    const view = await st.getPayeeStatement((await st.statementLink(a, owen))!.token);
    expect(view).toMatchObject({ businessName: "Casa Hosts", payee: { name: "Owen Marsh", role: "owner", nearAccount: "owen.testnet" } });
    expect(view!.rows).toHaveLength(1);
    expect(view!.rows[0]).toMatchObject({ role: "owner", amountRaw: 5_737_500n, status: "paid", txHash: "hash-HM1", propertyName: "Home HM1", checkIn: "2026-11-01" });

    const mv = await st.getPayeeStatement((await st.statementLink(a, maria))!.token);
    expect(mv!.rows).toEqual([expect.objectContaining({ role: "cleaner", status: "rejected", reason: "OverCap", txHash: null })]);
  });

  it("guest-safe: no guest names in what the page receives", async () => {
    await bookingWithSplits(a, "HM1", { owner: owen, cleaner: maria });
    const view = await st.getPayeeStatement((await st.statementLink(a, owen))!.token);
    expect(JSON.stringify(view, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain("Ana Reyes");
  });

  it("a removed payee's link stops working", async () => {
    const { token } = (await st.statementLink(a, owen))!;
    await people.setPayeeVaultStatus(a, owen, "removed");
    expect(await st.getPayeeStatement(token)).toBeNull();
  });

  it("unknown or malformed tokens find nothing", async () => {
    expect(await st.getPayeeStatement("A".repeat(22))).toBeNull();
    expect(await st.getPayeeStatement("not a token")).toBeNull();
    expect(await st.getPayeeStatement("")).toBeNull();
  });
});
