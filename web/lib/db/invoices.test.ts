import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
const db = await import("./index");
const people = await import("./people");
const inv = await import("./invoices");
const { db: conn } = await import("./conn");
const s = await import("./schema");
const { syncPayments } = await import("@/lib/payments/sync");

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

  it("waive: the operator forgives an open charge; refused while a guest payment is underway or once paid", async () => {
    const now = new Date("2026-11-05T12:00:00Z");
    const r = await charge(a);
    if (!r.ok) throw new Error(r.error);
    const pub = (await inv.getPublicInvoice(r.publicId))!;

    expect(await inv.waiveInvoice(b, r.publicId, now)).toEqual({ ok: false, error: "not_found" }); // RBAC
    expect(await inv.waiveInvoice(a, "nope", now)).toEqual({ ok: false, error: "not_found" });

    // a guest has a live deposit address: waiving now could leave their money unaccounted for
    await inv.recordPaymentStart(pub.id, { depositAddress: "mock-live", originAsset: "x", quoteDeadline: new Date("2026-11-05T13:00:00Z"), rawQuoteJson: {} });
    expect(await inv.waiveInvoice(a, r.publicId, now)).toEqual({ ok: false, error: "payment_in_progress" });
    // once that address has expired, it can be waived
    expect(await inv.waiveInvoice(a, r.publicId, new Date("2026-11-05T13:00:01Z"))).toMatchObject({ ok: true, id: pub.id });
    expect((await inv.getPublicInvoice(r.publicId))!.status).toBe("waived");
    expect(await inv.waiveInvoice(a, r.publicId, new Date("2026-11-05T14:00:00Z"))).toEqual({ ok: false, error: "not_open" }); // already waived

    // a deposit 1Click is processing blocks it regardless of the deadline
    const r2 = await charge(a);
    if (!r2.ok) throw new Error(r2.error);
    const pub2 = (await inv.getPublicInvoice(r2.publicId))!;
    await inv.recordPaymentStart(pub2.id, { depositAddress: "mock-2", originAsset: "x", quoteDeadline: new Date("2026-11-01T00:00:00Z"), rawQuoteJson: {} });
    const p2 = (await inv.findPayment(pub2.id, "mock-2"))!;
    await inv.applyPaymentUpdate(pub2.id, p2.id, { paymentStatus: "processing", invoiceStatus: "pending", amountReceived: 0n, raw: {} });
    expect(await inv.waiveInvoice(a, r2.publicId, now)).toEqual({ ok: false, error: "payment_in_progress" });
    // delivered but not yet confirmed on-chain: still in flight
    await inv.applyPaymentUpdate(pub2.id, p2.id, { paymentStatus: "delivered_unverified", invoiceStatus: "pending", amountReceived: 0n, raw: {} });
    expect(await inv.waiveInvoice(a, r2.publicId, now)).toEqual({ ok: false, error: "payment_in_progress" });
    await inv.applyPaymentUpdate(pub2.id, p2.id, { paymentStatus: "verified", invoiceStatus: "paid", amountReceived: 200n * U, destinationTx: "tx2", raw: {} });
    expect(await inv.waiveInvoice(a, r2.publicId, now)).toEqual({ ok: false, error: "not_open" }); // paid
  });

  it("a stay invoice can't be waived: reconciliation still expects it, so waiving would block the booking for good", async () => {
    const r = await charge(a);
    if (!r.ok) throw new Error(r.error);
    await (await conn()).update(s.invoices).set({ type: "booking" }).where(eq(s.invoices.publicId, r.publicId));
    expect(await inv.waiveInvoice(a, r.publicId, new Date())).toEqual({ ok: false, error: "not_waivable" });
    expect((await inv.getPublicInvoice(r.publicId))!.status).toBe("open");
  });

  it("money that really arrived beats a waiver; a stale poll doesn't", async () => {
    const r = await charge(a);
    if (!r.ok) throw new Error(r.error);
    const pub = (await inv.getPublicInvoice(r.publicId))!;
    await inv.recordPaymentStart(pub.id, { depositAddress: "mock-late", originAsset: "x", quoteDeadline: new Date("2026-11-01T00:00:00Z"), rawQuoteJson: {} });
    expect(await inv.waiveInvoice(a, r.publicId, new Date("2026-11-05T00:00:00Z"))).toMatchObject({ ok: true });
    const p = (await inv.findPayment(pub.id, "mock-late"))!;
    await inv.applyPaymentUpdate(pub.id, p.id, { paymentStatus: "processing", invoiceStatus: "pending", amountReceived: 0n, raw: {} });
    expect((await inv.getPublicInvoice(r.publicId))!.status).toBe("waived");
    await inv.applyPaymentUpdate(pub.id, p.id, { paymentStatus: "verified", invoiceStatus: "paid", amountReceived: 200n * U, destinationTx: "tx9", raw: {} });
    expect((await inv.getPublicInvoice(r.publicId))!.status).toBe("paid");
  });

  describe("syncPayments: the server checks payments itself, even after the guest closes the tab", () => {
    const deps = (status: string, credited = 0n) => ({
      oneClick: {
        quote: async () => { throw new Error("unused"); },
        status: async () => ({ status, updatedAt: "", swapDetails: { originChainTxHashes: [], destinationChainTxHashes: status === "SUCCESS" ? [{ hash: "dest1", explorerUrl: "" }] : [] } }),
      },
      verifyDelivery: async () => credited,
      now: () => new Date("2026-11-05T12:00:00Z"),
    }) as never;
    const started = async (userId = a) => {
      const r = await charge(userId);
      if (!r.ok) throw new Error(r.error);
      const pub = (await inv.getPublicInvoice(r.publicId))!;
      await inv.recordPaymentStart(pub.id, { depositAddress: `addr-${r.publicId}`, originAsset: "x", quoteDeadline: new Date("2026-11-05T13:00:00Z"), rawQuoteJson: {} });
      return r.publicId;
    };

    it("a guest who paid and left is marked paid, from the chain", async () => {
      const id = await started();
      expect(await syncPayments(a, { deps: () => deps("SUCCESS", 200n * U) })).toEqual({ checked: 1, failed: 0 });
      expect((await inv.getPublicInvoice(id))!.status).toBe("paid");
      expect(await syncPayments(a, { deps: () => deps("SUCCESS", 200n * U) })).toEqual({ checked: 0, failed: 0 }); // nothing left to ask
    });

    it("only touches this operator's payments, and one invoice when asked", async () => {
      const mine = await started();
      await started();
      expect((await syncPayments(b, { deps: () => deps("SUCCESS", 200n * U) })).checked).toBe(0);
      expect((await syncPayments(a, { publicId: mine, deps: () => deps("SUCCESS", 200n * U) })).checked).toBe(1);
    });

    it("asks 1Click with the deposit memo saved with the quote (memo chains need it)", async () => {
      const r = await charge(a);
      if (!r.ok) throw new Error(r.error);
      const pub = (await inv.getPublicInvoice(r.publicId))!;
      await inv.recordPaymentStart(pub.id, { depositAddress: "shared-addr", depositMemo: "memo-7", originAsset: "x", quoteDeadline: new Date("2026-11-05T13:00:00Z"), rawQuoteJson: {} });
      const asked: unknown[][] = [];
      const base = deps("PENDING_DEPOSIT") as unknown as { oneClick: { status: (...a: unknown[]) => Promise<unknown> } };
      const spy = () => ({ ...base, oneClick: { ...base.oneClick, status: async (...args: unknown[]) => (asked.push(args), base.oneClick.status()) } }) as never;
      await syncPayments(a, { deps: spy });
      expect(asked).toEqual([["shared-addr", "memo-7"]]);
    });

    it("reports a failed check, so a waive can refuse rather than guess", async () => {
      await started();
      const broken = () => ({ ...(deps("SUCCESS") as object), oneClick: { status: async () => { throw new Error("1Click down"); } } }) as never;
      expect(await syncPayments(a, { deps: broken })).toEqual({ checked: 1, failed: 1 });
    });

    it("a row stuck at processing stops blocking a waive once 1Click says it failed", async () => {
      const id = await started();
      const pub = (await inv.getPublicInvoice(id))!;
      const p = (await inv.findPayment(pub.id, `addr-${id}`))!;
      await inv.applyPaymentUpdate(pub.id, p.id, { paymentStatus: "processing", invoiceStatus: "pending", amountReceived: 0n, raw: {} });
      expect(await inv.waiveInvoice(a, id, new Date("2026-11-05T12:00:00Z"))).toEqual({ ok: false, error: "payment_in_progress" });
      await syncPayments(a, { publicId: id, deps: () => deps("FAILED") });
      expect(await inv.waiveInvoice(a, id, new Date("2026-11-05T12:00:00Z"))).toMatchObject({ ok: true });
    });
  });

  it("vault account is per operator", async () => {
    await inv.setVaultAccount(a, "vault.op.testnet");
    expect(await inv.getVaultAccount(a)).toBe("vault.op.testnet");
    expect(await inv.getVaultAccount(b)).toBeNull();
  });
});
