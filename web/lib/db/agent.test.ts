import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
const db = await import("./index");
const agent = await import("./agent");
const { db: conn } = await import("./conn");
const s = await import("./schema");

const U = 1_000_000n;
let a: string, b: string;

const run = async (userId: string, status: "succeeded" | "held", paidTotalRaw: bigint) =>
  (await conn()).insert(s.agentRuns).values({ userId, trigger: "manual", status, paidTotalRaw });

beforeEach(async () => {
  db.__resetDbForTests();
  a = (await db.createUser({ email: "a@x.com", name: "A", passwordHash: "h" }))!.id;
  b = (await db.createUser({ email: "b@x.com", name: "B", passwordHash: "h" }))!.id;
});

describe("paidTotals", () => {
  it("is exact and all-time: a run of held runs doesn't push real payouts out of the total", async () => {
    for (let i = 0; i < 3; i++) await run(a, "succeeded", 100n * U);
    for (let i = 0; i < 6; i++) await run(a, "held", 0n);
    await run(b, "succeeded", 7n * U);
    expect(await agent.paidTotals(a)).toEqual({ total: 300n * U, runs: 3 });
  });

  it("stays a bigint above 2^53", async () => {
    await run(a, "succeeded", 2n ** 60n + 1n);
    await run(a, "succeeded", 1n);
    expect((await agent.paidTotals(a)).total).toBe(2n ** 60n + 2n);
  });

  it("is zero with no runs", async () => {
    expect(await agent.paidTotals(a)).toEqual({ total: 0n, runs: 0 });
  });
});
