import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { importReport, summarize } from "@/lib/importers";

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
const db = await import("./index");
const people = await import("./people");
const bk = await import("./bookings");

const csv = readFileSync(new URL("../../test/fixtures/payout-reports/airbnb-style.csv", import.meta.url), "utf8");
let a: string, b: string;

async function seedProperties(userId: string) {
  for (const name of ["Casa Azul", "Loft 21", "Seaside Cottage"]) await people.createProperty(userId, { name, cleaningFeeRaw: 0n, mgmtFeeBps: 0 });
  return (await people.listProperties(userId)).map((p) => ({ id: p.id, name: p.name }));
}
async function preview(userId: string) {
  const props = await seedPropsOnce(userId);
  const first = importReport(csv, { properties: props, existing: new Map() });
  const refs = first.rows.map((r) => r.ref).filter(Boolean);
  return importReport(csv, { properties: props, existing: await bk.existingForImport(userId, "airbnb", refs) });
}
const seeded = new Map<string, { id: string; name: string }[]>();
async function seedPropsOnce(userId: string) {
  if (!seeded.has(userId)) seeded.set(userId, await seedProperties(userId));
  return seeded.get(userId)!;
}

beforeEach(async () => {
  db.__resetDbForTests();
  seeded.clear();
  a = (await db.createUser({ email: "a@x.com", name: "A", passwordHash: "h" }))!.id;
  b = (await db.createUser({ email: "b@x.com", name: "B", passwordHash: "h" }))!.id;
});

describe("import → bookings", () => {
  it("writes the 22 good rows as OTA bookings; flagged/duplicate/ignored rows are not written", async () => {
    const p = await preview(a);
    expect(summarize(p.rows)).toEqual({ ok: 22, flagged: 2, duplicate: 1, ignored: 2 });
    expect(await bk.applyImport(a, p.rows, "import:airbnb")).toEqual({ created: 22, updated: 0 });
    const list = await bk.listBookingsWithRecon(a, new Date("2026-11-06T00:00:00Z"));
    expect(list).toHaveLength(22);
    expect(list[0]).toMatchObject({ channel: "airbnb", externalRef: "HM4000X", propertyName: "Casa Azul" });
  });

  it("re-importing the same file is a no-op: every row is now a duplicate", async () => {
    await bk.applyImport(a, (await preview(a)).rows, "import:airbnb");
    const again = await preview(a);
    expect(summarize(again.rows)).toEqual({ ok: 0, flagged: 2, duplicate: 23, ignored: 2 });
    expect(await bk.applyImport(a, again.rows, "import:airbnb")).toEqual({ created: 0, updated: 0 });
    expect(await bk.listBookingsWithRecon(a)).toHaveLength(22);
  });

  it("reconciliation: 21 matched, the $20 underpayment is a blocked mismatch", async () => {
    await bk.applyImport(a, (await preview(a)).rows, "import:airbnb");
    const list = await bk.listBookingsWithRecon(a, new Date("2026-11-06T00:00:00Z"));
    const by = (r: string) => list.filter((x) => x.recon.result === r);
    expect(by("matched")).toHaveLength(21);
    expect(by("mismatch").map((x) => x.externalRef)).toEqual(["HM4009X"]);
    expect(by("mismatch")[0].recon).toMatchObject({ settlementStatus: "blocked", delta: -20_000_000n });
  });

  it("RBAC: operators never see or touch each other's bookings", async () => {
    await bk.applyImport(a, (await preview(a)).rows, "import:airbnb");
    expect(await bk.listBookingsWithRecon(b)).toEqual([]);
    expect((await bk.existingForImport(b, "airbnb", ["HM4000X"])).size).toBe(0);
    // b importing the same file gets its own 22 bookings
    expect(await bk.applyImport(b, (await preview(b)).rows, "import:airbnb")).toEqual({ created: 22, updated: 0 });
  });
});

describe("accept a short payout as final", () => {
  it("only for the operator's own mismatch, only for the amount shown; then it's ready to pay on what arrived", async () => {
    await bk.applyImport(a, (await preview(a)).rows, "import:airbnb");
    const short = (await bk.listBookingsWithRecon(a)).find((x) => x.externalRef === "HM4009X")!;
    const ok = (await bk.listBookingsWithRecon(a)).find((x) => x.externalRef === "HM4000X")!;

    expect(await bk.acceptCollected(b, short.id, 474_700_000n)).toEqual({ ok: false, error: "not_found" }); // RBAC
    expect(await bk.acceptCollected(a, ok.id, ok.recon.collected)).toEqual({ ok: false, error: "not_mismatch" });
    expect(await bk.acceptCollected(a, short.id, 494_700_000n)).toEqual({ ok: false, error: "amount_changed" });
    expect(await bk.acceptCollected(a, short.id, 474_700_000n)).toEqual({ ok: true, delta: -20_000_000n });

    const after = (await bk.listBookingsWithRecon(a)).find((x) => x.externalRef === "HM4009X")!;
    expect(after.recon).toMatchObject({ result: "matched", settlementStatus: "ready", collected: 474_700_000n });
    expect(after.recon.note).toBe("Accepted $474.70 as final ($20.00 short of $494.70)");
  });
});

describe("direct bookings", () => {
  it("is overdue from the invoice's pay-by date, not check-out", async () => {
    const [casa] = await seedPropsOnce(a);
    const r = await bk.createDirectBooking(a, { propertyId: casa.id, guestName: "Lena Park", checkIn: "2026-11-05", checkOut: "2026-11-07", totalRaw: 600_000_000n, dueDate: "2026-11-12" });
    if (!r.ok) throw new Error(r.error);
    const at = async (d: string) => (await bk.listBookingsWithRecon(a, new Date(d))).find((x) => x.id === r.id)!.recon;
    expect(await at("2026-11-08T00:00:00Z")).toMatchObject({ result: "awaiting_payment", settlementStatus: "unreconciled" });
    expect(await at("2026-11-12T23:00:00Z")).toMatchObject({ result: "awaiting_payment" });
    const late = await at("2026-11-13T00:00:00Z");
    expect(late).toMatchObject({ result: "unpaid", settlementStatus: "blocked" });
    expect(late.note).toContain("Nov 12, 2026");
  });

  it("creates the booking and its stay invoice together; open until paid, then ready to pay out", async () => {
    const [casa] = await seedPropsOnce(a);
    const r = await bk.createDirectBooking(a, { propertyId: casa.id, guestName: "Lena Park", checkIn: "2026-11-20", checkOut: "2026-11-23", totalRaw: 600_000_000n, dueDate: "2026-11-18" });
    if (!r.ok) throw new Error(r.error);
    expect(r.externalRef).toMatch(/^D-[2-9A-HJ-KM-NP-Z]{6}$/);
    expect(r.publicId).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const row = (await bk.listBookingsWithRecon(a, new Date("2026-11-10T00:00:00Z"))).find((x) => x.id === r.id)!;
    expect(row).toMatchObject({ channel: "direct", guestName: "Lena Park", propertyName: "Casa Azul" });
    expect(row.recon).toMatchObject({ result: "awaiting_payment", settlementStatus: "unreconciled" });

    const { listInvoices } = await import("./invoices");
    const [i] = await listInvoices(a);
    expect(i).toMatchObject({ publicId: r.publicId, type: "booking", amountRaw: 600_000_000n, status: "open", dueDate: "2026-11-18", description: "Stay at Casa Azul, Nov 20 – Nov 23" });
  });

  it("refuses another operator's property and impossible dates", async () => {
    const [casa] = await seedPropsOnce(a);
    expect(await bk.createDirectBooking(b, { propertyId: casa.id, guestName: "X", checkIn: "2026-11-20", checkOut: "2026-11-23", totalRaw: 1n, dueDate: "2026-11-18" })).toEqual({ ok: false, error: "invalid_property" });
    expect(await bk.createDirectBooking(a, { propertyId: casa.id, guestName: "X", checkIn: "2026-11-23", checkOut: "2026-11-23", totalRaw: 1n, dueDate: "2026-11-18" })).toEqual({ ok: false, error: "invalid_dates" });
  });
});
