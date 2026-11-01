import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
const db = await import("./index");
const people = await import("./people");
const inv = await import("./invoices");
const { db: conn } = await import("./conn");
const s = await import("./schema");

const U = 1_000_000n;
let a: string, b: string, bookingA: string;

beforeEach(async () => {
  db.__resetDbForTests();
  a = (await db.createUser({ email: "a@x.com", name: "Casa Hosts", passwordHash: "h" }))!.id;
  b = (await db.createUser({ email: "b@x.com", name: "B", passwordHash: "h" }))!.id;
  const p = await people.createProperty(a, { name: "Casa Azul", cleaningFeeRaw: 0n, mgmtFeeBps: 0 });
  if (!p.ok) throw new Error();
  const [bk] = await (await conn())
    .insert(s.bookings)
    .values({ userId: a, propertyId: p.id, externalRef: "HM1", channel: "airbnb", collectionMode: "ota_payout", guestName: "Ana Reyes", checkIn: "2026-10-01", checkOut: "2026-10-03", expectedGrossRaw: 1n })
    .returning();
  bookingA = bk.id;
});

const charge = (userId: string, bookingId = bookingA) =>
  inv.createChargeInvoice(userId, { bookingId, type: "penalty", description: "Damage: broken lamp", amountRaw: 200n * U, operatorRevenue: false, dueDate: "2026-11-10" });

describe("invoices", () => {
  it("creates a penalty invoice with an unguessable public id; guest view is narrow", async () => {
    const r = await charge(a);
    if (!r.ok) throw new Error(r.error);
    expect(r.publicId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const pub = await inv.getPublicInvoice(r.publicId);
    expect(pub).toMatchObject({ description: "Damage: broken lamp", amountRaw: 200n * U, status: "open", businessName: "Casa Hosts", propertyName: "Casa Azul", vaultAccount: null });
    expect(Object.keys(pub!)).not.toContain("userId");
  });

  it("RBAC: can't charge against another operator's booking; lists are scoped", async () => {
    expect(await charge(b)).toEqual({ ok: false, error: "invalid_booking" });
    await charge(a);
    expect(await inv.listInvoices(b)).toEqual([]);
    expect(await inv.listInvoices(a)).toHaveLength(1);
  });

  it("bad or unknown public ids return null (no lookup by guessable values)", async () => {
    expect(await inv.getPublicInvoice("x")).toBeNull();
    expect(await inv.getPublicInvoice("A".repeat(22))).toBeNull();
  });

  it("payment lifecycle: start → verified moves the invoice to paid; it never goes back", async () => {
    const r = await charge(a);
    if (!r.ok) throw new Error();
    const pub = (await inv.getPublicInvoice(r.publicId))!;
    await inv.recordPaymentStart(pub.id, { depositAddress: "mock-1", originAsset: "x", quoteDeadline: new Date(), rawQuoteJson: { sig: "s" } });
    expect(await inv.findPayment(pub.id, "someone-elses-address")).toBeNull();
    const p = (await inv.findPayment(pub.id, "mock-1"))!;
    await inv.applyPaymentUpdate(pub.id, p.id, { paymentStatus: "verified", invoiceStatus: "paid", amountReceived: 200n * U, destinationTx: "tx1", raw: {} });
    expect((await inv.getPublicInvoice(r.publicId))!.status).toBe("paid");
    // a late, stale poll can't un-pay it
    await inv.applyPaymentUpdate(pub.id, p.id, { paymentStatus: "processing", invoiceStatus: "pending", amountReceived: 0n, raw: {} });
    expect((await inv.getPublicInvoice(r.publicId))!.status).toBe("paid");
  });

  it("vault account is per operator", async () => {
    await inv.setVaultAccount(a, "vault.op.testnet");
    expect(await inv.getVaultAccount(a)).toBe("vault.op.testnet");
    expect(await inv.getVaultAccount(b)).toBeNull();
  });
});
