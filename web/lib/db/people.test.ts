import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
const db = await import("./index");
const people = await import("./people");

const U = 1_000_000n;
let a: string, b: string;

beforeEach(async () => {
  db.__resetDbForTests();
  a = (await db.createUser({ email: "a@x.com", name: "A", passwordHash: "h" }))!.id;
  b = (await db.createUser({ email: "b@x.com", name: "B", passwordHash: "h" }))!.id;
});

describe("payees", () => {
  it("creates and lists only the operator's own payees, pending signature, cap as bigint", async () => {
    await people.createPayee(a, { name: "Owen", role: "owner", nearAccount: "owen.testnet", capRaw: 800n * U });
    await people.createPayee(b, { name: "Other", role: "owner", nearAccount: "other.testnet", capRaw: U });
    const list = await people.listPayees(a);
    expect(list.map((p) => p.name)).toEqual(["Owen"]);
    expect(list[0]).toMatchObject({ vaultStatus: "pending_signature", capRaw: 800n * U });
  });

  it("the same account twice for one operator is a duplicate (fine across operators)", async () => {
    expect(await people.createPayee(a, { name: "Owen", role: "owner", nearAccount: "owen.testnet", capRaw: U })).toMatchObject({ ok: true });
    expect(await people.createPayee(a, { name: "Owen 2", role: "owner", nearAccount: "owen.testnet", capRaw: U })).toEqual({ ok: false, error: "duplicate_account" });
    expect(await people.createPayee(b, { name: "Owen", role: "owner", nearAccount: "owen.testnet", capRaw: U })).toMatchObject({ ok: true });
  });
});

describe("after removing a payee", () => {
  const owen = { name: "Owen", role: "owner" as const, nearAccount: "owen.testnet", capRaw: 800n * U };

  it("the same account can be added back: it needs approving again, with the new name and limit", async () => {
    const r = await people.createPayee(a, owen);
    if (!r.ok) throw new Error();
    await people.setPayeeVaultStatus(a, r.id, "removed");
    expect(await people.createPayee(a, { ...owen, name: "Owen R", capRaw: 900n * U })).toEqual({ ok: true, id: r.id });
    expect(await people.getPayee(a, r.id)).toMatchObject({ name: "Owen R", capRaw: 900n * U, vaultStatus: "pending_signature" });
  });

  it("adding it back with a different role is refused: properties still point at this payee", async () => {
    const r = await people.createPayee(a, owen);
    if (!r.ok) throw new Error();
    await people.setPayeeVaultStatus(a, r.id, "removed");
    expect(await people.createPayee(a, { ...owen, role: "cleaner" })).toEqual({ ok: false, error: "duplicate_account" });
    expect(await people.getPayee(a, r.id)).toMatchObject({ vaultStatus: "removed" });
  });

  it("the vault's old 'inactive' record doesn't undo adding them back", async () => {
    const r = await people.createPayee(a, owen);
    if (!r.ok) throw new Error();
    await people.setPayeeVaultStatus(a, r.id, "removed");
    await people.createPayee(a, owen);
    await people.syncPayeeStatuses(a, [{ accountId: owen.nearAccount, role: "owner", capPerPayout: owen.capRaw, payableFromNs: 0n, active: false }], 1n);
    expect(await people.getPayee(a, r.id)).toMatchObject({ vaultStatus: "pending_signature" });
  });

  it("a property can move to someone else; only the operator's own, right-role, non-removed payees", async () => {
    const gone = await people.createPayee(a, owen);
    const next = await people.createPayee(a, { ...owen, name: "Nia", nearAccount: "nia.testnet" });
    const maria = await people.createPayee(a, { name: "Maria", role: "cleaner", nearAccount: "maria.testnet", capRaw: U });
    const theirs = await people.createPayee(b, owen);
    if (!gone.ok || !next.ok || !maria.ok || !theirs.ok) throw new Error();
    const p = await people.createProperty(a, { name: "Casa Azul", ownerPayeeId: gone.id, cleanerPayeeId: maria.id, cleaningFeeRaw: 80n * U, mgmtFeeBps: 1500 });
    if (!p.ok) throw new Error();
    await people.setPayeeVaultStatus(a, gone.id, "removed");

    expect(await people.setPropertyPayees(a, p.id, { ownerPayeeId: next.id, cleanerPayeeId: maria.id })).toEqual({ ok: true });
    expect((await people.listProperties(a))[0]).toMatchObject({ ownerName: "Nia", cleanerName: "Maria" });

    expect(await people.setPropertyPayees(a, p.id, { ownerPayeeId: gone.id, cleanerPayeeId: maria.id })).toEqual({ ok: false, error: "invalid_owner" });
    expect(await people.setPropertyPayees(a, p.id, { ownerPayeeId: theirs.id })).toEqual({ ok: false, error: "invalid_owner" });
    expect(await people.setPropertyPayees(a, p.id, { ownerPayeeId: next.id, cleanerPayeeId: next.id })).toEqual({ ok: false, error: "invalid_cleaner" });
    expect(await people.setPropertyPayees(b, p.id, { ownerPayeeId: theirs.id })).toEqual({ ok: false, error: "not_found" });
    expect(await people.setPropertyPayees(a, "not-a-uuid", {})).toEqual({ ok: false, error: "not_found" });
  });
});

describe("properties", () => {
  it("links owner and cleaner payees and lists their names", async () => {
    const owen = await people.createPayee(a, { name: "Owen", role: "owner", nearAccount: "owen.testnet", capRaw: U });
    const maria = await people.createPayee(a, { name: "Maria", role: "cleaner", nearAccount: "maria.testnet", capRaw: U });
    if (!owen.ok || !maria.ok) throw new Error("setup");
    const r = await people.createProperty(a, { name: "Casa Azul", ownerPayeeId: owen.id, cleanerPayeeId: maria.id, cleaningFeeRaw: 80n * U, mgmtFeeBps: 1500 });
    expect(r).toMatchObject({ ok: true });
    const [p] = await people.listProperties(a);
    expect(p).toMatchObject({ name: "Casa Azul", ownerName: "Owen", cleanerName: "Maria", cleaningFeeRaw: 80n * U, mgmtFeeBps: 1500 });
  });

  it("RBAC: can't attach another operator's payee", async () => {
    const theirs = await people.createPayee(b, { name: "Mallory", role: "owner", nearAccount: "mallory.testnet", capRaw: U });
    if (!theirs.ok) throw new Error("setup");
    expect(await people.createProperty(a, { name: "Casa", ownerPayeeId: theirs.id, cleaningFeeRaw: 0n, mgmtFeeBps: 0 })).toEqual({ ok: false, error: "invalid_owner" });
    expect(await people.listProperties(b)).toEqual([]);
  });

  it("roles must match: a cleaner can't be the property owner", async () => {
    const maria = await people.createPayee(a, { name: "Maria", role: "cleaner", nearAccount: "maria.testnet", capRaw: U });
    if (!maria.ok) throw new Error("setup");
    expect(await people.createProperty(a, { name: "Casa", ownerPayeeId: maria.id, cleaningFeeRaw: 0n, mgmtFeeBps: 0 })).toEqual({ ok: false, error: "invalid_owner" });
    expect(await people.createProperty(a, { name: "Casa", cleanerPayeeId: "00000000-0000-4000-8000-000000000000", cleaningFeeRaw: 0n, mgmtFeeBps: 0 })).toEqual({ ok: false, error: "invalid_cleaner" });
  });

  it("property names are unique per operator", async () => {
    await people.createProperty(a, { name: "Casa", cleaningFeeRaw: 0n, mgmtFeeBps: 0 });
    expect(await people.createProperty(a, { name: "Casa", cleaningFeeRaw: 0n, mgmtFeeBps: 0 })).toEqual({ ok: false, error: "duplicate_name" });
  });

  it("setup counts for the overview checklist", async () => {
    await people.createPayee(a, { name: "Owen", role: "owner", nearAccount: "owen.testnet", capRaw: U });
    expect(await people.setupCounts(a)).toEqual({ payees: 1, activePayees: 0, properties: 0 });
  });
});

describe("syncPayeeStatuses (mirror the vault's view)", () => {
  const NOW = 1_000n * 1_000_000_000n;
  const onVault = (accountId: string, payableFromNs: bigint, active = true) =>
    ({ accountId, role: "cleaner" as const, capPerPayout: U, payableFromNs, active });

  it("a waiting payee turns active once its time has passed; others follow the vault", async () => {
    const m = await people.createPayee(a, { name: "Maria", role: "cleaner", nearAccount: "maria.testnet", capRaw: U });
    const w = await people.createPayee(a, { name: "Wes", role: "cleaner", nearAccount: "wes.testnet", capRaw: U });
    const n = await people.createPayee(a, { name: "New", role: "cleaner", nearAccount: "new.testnet", capRaw: U });
    if (!m.ok || !w.ok || !n.ok) throw new Error("setup");
    await people.setPayeeVaultStatus(a, m.id, "in_delay");
    await people.setPayeeVaultStatus(a, w.id, "in_delay");

    await people.syncPayeeStatuses(a, [onVault("maria.testnet", NOW - 1n), onVault("wes.testnet", NOW + 1n)], NOW);
    const by = Object.fromEntries((await people.listPayees(a)).map((p) => [p.name, p.vaultStatus]));
    expect(by).toEqual({ Maria: "active", Wes: "in_delay", New: "pending_signature" });
  });

  it("only touches the operator's own payees", async () => {
    const mine = await people.createPayee(a, { name: "Maria", role: "cleaner", nearAccount: "maria.testnet", capRaw: U });
    const theirs = await people.createPayee(b, { name: "Maria", role: "cleaner", nearAccount: "maria.testnet", capRaw: U });
    if (!mine.ok || !theirs.ok) throw new Error("setup");
    await people.setPayeeVaultStatus(b, theirs.id, "in_delay");
    await people.syncPayeeStatuses(a, [onVault("maria.testnet", 0n)], NOW);
    expect((await people.listPayees(a))[0].vaultStatus).toBe("active");
    expect((await people.listPayees(b))[0].vaultStatus).toBe("in_delay");
  });
});
