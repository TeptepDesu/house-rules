import { describe, expect, it } from "vitest";
import { MAX_BATCH, type VaultPayee, settleGasTgas } from "@/lib/near/policy";
import { chunk, precheck, type PrecheckInput } from "./precheck";

// Mirrors contracts/vault/src/tests.rs: same payees, caps, limits and boundaries,
// so a rule change that's made in only one place shows up as a failing test.
const HOUR = 3_600_000_000_000n;
const USD = 1_000_000n;
const owen: VaultPayee = { accountId: "owen.near", role: "owner", capPerPayout: 800n * USD, payableFromNs: HOUR, active: true };
const maria: VaultPayee = { accountId: "maria.near", role: "cleaner", capPerPayout: 100n * USD, payableFromNs: HOUR, active: true };

function input(over: Partial<PrecheckInput> = {}): PrecheckInput {
  return {
    payees: [owen, maria],
    paidKeys: new Set(),
    remainingToday: 3_000n * USD,
    vaultBalance: 10_000n * USD,
    nowNs: 2n * HOUR,
    ...over,
  };
}
const item = (key: string, payee: string, amount: bigint) => ({ key, payee, amount });
const reasons = (r: ReturnType<typeof precheck>) => Object.fromEntries(r.rejected.map((x) => [x.item.key, x.reason]));

describe("precheck mirrors the vault's rules", () => {
  it("accepts a valid booking", () => {
    const r = precheck(input(), [item("b1:owner", "owen.near", 300n * USD), item("b1:cleaner", "maria.near", 50n * USD)]);
    expect(r.accepted.map((i) => i.key)).toEqual(["b1:owner", "b1:cleaner"]);
    expect(r.rejected).toEqual([]);
    expect(r.acceptedTotal).toBe(350n * USD);
  });

  it("InvalidItem: zero amount, empty key, key over 64 bytes (exactly 64 is fine)", () => {
    const r = precheck(input(), [
      item("b1:owner", "owen.near", 0n),
      item("", "owen.near", 1n),
      item("k".repeat(65), "owen.near", 1n),
      item("k".repeat(64), "owen.near", 1n),
    ]);
    expect(r.rejected.map((x) => x.reason)).toEqual(["InvalidItem", "InvalidItem", "InvalidItem"]);
    expect(r.accepted).toHaveLength(1);
  });

  it("PayeeNotAllowed: unknown or removed payee", () => {
    const r = precheck(input({ payees: [{ ...owen, active: false }, maria] }), [
      item("b1:owner", "owen.near", USD),
      item("b2:owner", "mallory.near", USD),
    ]);
    expect(reasons(r)).toEqual({ "b1:owner": "PayeeNotAllowed", "b2:owner": "PayeeNotAllowed" });
  });

  it("PayeeInDelay: boundary is inclusive of payable_from", () => {
    const p = { ...maria, accountId: "new.near", payableFromNs: 11n * HOUR };
    expect(reasons(precheck(input({ payees: [p], nowNs: 11n * HOUR - 1n }), [item("b1:cleaner", "new.near", 1n)]))).toEqual({
      "b1:cleaner": "PayeeInDelay",
    });
    expect(precheck(input({ payees: [p], nowNs: 11n * HOUR }), [item("b1:cleaner", "new.near", 1n)]).accepted).toHaveLength(1);
  });

  it("OverCap: cap is inclusive", () => {
    expect(reasons(precheck(input(), [item("b1:cleaner", "maria.near", 100n * USD + 1n)]))).toEqual({ "b1:cleaner": "OverCap" });
    expect(precheck(input(), [item("b1:cleaner", "maria.near", 100n * USD)]).accepted).toHaveLength(1);
  });

  it("AlreadyPaid: paid before, or repeated in the same run", () => {
    const r = precheck(input({ paidKeys: new Set(["b1:owner"]) }), [
      item("b1:owner", "owen.near", USD),
      item("b2:owner", "owen.near", USD),
      item("b2:owner", "owen.near", USD),
    ]);
    expect(r.accepted.map((i) => i.key)).toEqual(["b2:owner"]);
    expect(r.rejected.map((x) => [x.item.key, x.reason])).toEqual([
      ["b1:owner", "AlreadyPaid"],
      ["b2:owner", "AlreadyPaid"],
    ]);
  });

  it("check order matches the contract: payee before cap, first failing rule wins", () => {
    expect(reasons(precheck(input(), [item("b1:owner", "mallory.near", 10_000n * USD)]))).toEqual({ "b1:owner": "PayeeNotAllowed" });
    expect(reasons(precheck(input({ remainingToday: 1n }), [item("b1:cleaner", "maria.near", 101n * USD)]))).toEqual({
      "b1:cleaner": "OverCap",
    });
  });

  it("DailyLimitExceeded: whole bookings fit greedily in order; exact limit is fine", () => {
    const r = precheck(input({ remainingToday: 100n * USD }), [
      item("b1:owner", "owen.near", 60n * USD),
      item("b1:cleaner", "maria.near", 40n * USD), // b1 = $100, exactly the limit
      item("b2:owner", "owen.near", 1n), // over
    ]);
    expect(r.accepted.map((i) => i.key)).toEqual(["b1:owner", "b1:cleaner"]);
    expect(reasons(r)).toEqual({ "b2:owner": "DailyLimitExceeded" });
  });

  it("InsufficientBalance: never plan more than the vault holds (ask the operator to top up)", () => {
    const r = precheck(input({ vaultBalance: 50n * USD }), [item("b1:owner", "owen.near", 60n * USD), item("b2:cleaner", "maria.near", 50n * USD)]);
    expect(reasons(r)).toEqual({ "b1:owner": "InsufficientBalance" });
    expect(r.accepted.map((i) => i.key)).toEqual(["b2:cleaner"]);
  });

  it("a booking is all-or-nothing: one bad item holds its siblings", () => {
    const r = precheck(input(), [item("b1:owner", "owen.near", 300n * USD), item("b1:cleaner", "maria.near", 101n * USD)]);
    expect(r.accepted).toEqual([]);
    expect(reasons(r)).toEqual({ "b1:cleaner": "OverCap", "b1:owner": "SiblingRejected" });
  });
});

describe("chunk", () => {
  const many = (bookings: number) =>
    Array.from({ length: bookings }, (_, b) => [item(`b${b}:owner`, "owen.near", 1n), item(`b${b}:cleaner`, "maria.near", 1n)]).flat();

  it("splits into batches of at most MAX_BATCH, losing and duplicating nothing", () => {
    const items = many(45); // 90 items
    const chunks = chunk(items);
    expect(chunks.every((c) => c.length <= MAX_BATCH)).toBe(true);
    expect(chunks.flat()).toEqual(items);
  });

  it("never splits a booking across chunks", () => {
    const items = [item("solo:owner", "owen.near", 1n), ...many(20)]; // 41 items: a split at 40 would cut b19
    const chunks = chunk(items);
    for (const c of chunks) {
      const ids = new Set(c.map((i) => i.key.split(":")[0]));
      for (const id of ids) expect(items.filter((i) => i.key.startsWith(`${id}:`))).toEqual(c.filter((i) => i.key.startsWith(`${id}:`)));
    }
    expect(chunks.flat()).toEqual(items);
  });

  it("empty input → no chunks", () => expect(chunk([])).toEqual([]));
});

describe("settleGasTgas", () => {
  it("is 30 + 6n, capped at 300", () => {
    expect(settleGasTgas(1)).toBe(36);
    expect(settleGasTgas(40)).toBe(270);
    expect(settleGasTgas(100)).toBe(300);
  });
});
