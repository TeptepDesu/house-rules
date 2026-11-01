import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { newPublicId } from "@/lib/ids";
import { type Db, createDb } from "./client";
import * as s from "./schema";

// Real migrations on in-memory Postgres (PGlite).
let db: Db;
let userId: string, propertyId: string, bookingId: string, invoiceId: string;

beforeAll(async () => {
  db = await createDb({ PGLITE_DIR: "memory://", NODE_ENV: "test" } as NodeJS.ProcessEnv);
  [{ id: userId }] = await db.insert(s.users).values({ email: "op@example.com", name: "Op", passwordHash: "h" }).returning();
  const [owen] = await db.insert(s.payees).values({ userId, name: "Owen", role: "owner", nearAccount: "owen.testnet", capRaw: 800_000_000n }).returning();
  [{ id: propertyId }] = await db
    .insert(s.properties)
    .values({ userId, name: "Casa Azul", ownerPayeeId: owen.id, cleaningFeeRaw: 80_000_000n, mgmtFeeBps: 1500 })
    .returning();
  [{ id: bookingId }] = await db
    .insert(s.bookings)
    .values({ userId, propertyId, externalRef: "HM4000X", channel: "airbnb", collectionMode: "ota_payout", guestName: "Ana", checkIn: "2026-10-01", checkOut: "2026-10-03", expectedGrossRaw: 368_600_000n })
    .returning();
  [{ id: invoiceId }] = await db.insert(s.invoices).values({ userId, bookingId, publicId: newPublicId(), type: "penalty", amountRaw: 200_000_000n, dueDate: "2026-11-10" }).returning();
});

describe("schema", () => {
  it("money columns round-trip as bigint, beyond Number.MAX_SAFE_INTEGER", async () => {
    const big = 9_007_199_254_740_993n; // 2^53 + 1
    await db.update(s.bookings).set({ otaPayoutRaw: big }).where(eq(s.bookings.id, bookingId));
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, bookingId));
    expect(typeof b.otaPayoutRaw).toBe("bigint");
    expect(b.otaPayoutRaw).toBe(big);
    expect(typeof b.expectedGrossRaw).toBe("bigint");
    const [p] = await db.select().from(s.properties);
    expect(p.cleaningFeeRaw).toBe(80_000_000n);
  });

  it("defaults: settlement unreconciled, invoice open, penalty proceeds to owner", async () => {
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, bookingId));
    const [i] = await db.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
    expect(b.settlementStatus).toBe("unreconciled");
    expect(i.status).toBe("open");
    expect(i.operatorRevenue).toBe(false);
  });

  it("one booking per (operator, channel, external ref)", async () => {
    await expect(
      db.insert(s.bookings).values({ userId, propertyId, externalRef: "HM4000X", channel: "airbnb", collectionMode: "ota_payout", guestName: "Dup", checkIn: "2026-10-01", checkOut: "2026-10-03", expectedGrossRaw: 1n }),
    ).rejects.toThrow();
  });

  it("double payout is impossible in the DB: one split per (booking, role) and per vault key", async () => {
    await db.insert(s.payoutSplits).values({ bookingId, role: "owner", amountRaw: 1n, vaultKey: `${bookingId}:owner` });
    await expect(db.insert(s.payoutSplits).values({ bookingId, role: "owner", amountRaw: 2n, vaultKey: `${bookingId}:owner2` })).rejects.toThrow();
    await expect(db.insert(s.payoutSplits).values({ bookingId, role: "cleaner", amountRaw: 2n, vaultKey: `${bookingId}:owner` })).rejects.toThrow();
  });

  it("a deposit address and a destination tx can only belong to one payment", async () => {
    const base = { invoiceId, originAsset: "nep141:x", quoteDeadline: new Date("2026-11-06T13:00:00Z") };
    await db.insert(s.payments).values({ ...base, depositAddress: "0xAAA", destinationTx: "tx1" });
    await expect(db.insert(s.payments).values({ ...base, depositAddress: "0xAAA" })).rejects.toThrow();
    await expect(db.insert(s.payments).values({ ...base, depositAddress: "0xBBB", destinationTx: "tx1" })).rejects.toThrow();
  });

  it("enums reject unknown values", async () => {
    await expect(db.insert(s.payees).values({ userId, name: "X", role: "manager" as never, nearAccount: "x.testnet", capRaw: 1n })).rejects.toThrow();
  });
});

describe("newPublicId", () => {
  it("is 128-bit base64url (22 chars) and doesn't repeat", () => {
    const ids = new Set(Array.from({ length: 1000 }, newPublicId));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});
