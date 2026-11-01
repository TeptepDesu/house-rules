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
