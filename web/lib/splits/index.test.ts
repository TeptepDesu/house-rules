import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { payoutItems, splitBooking, splitCollected } from "./index";

const U = 1_000_000n;

describe("splitCollected (plan §6B)", () => {
  it("worked example: $1,000 collected, $80 cleaning, 15% management", () => {
    // net = 920; mgmt = 138; owner = 782
    expect(splitCollected({ collected: 1_000n * U, cleaningFee: 80n * U, mgmtFeeBps: 1500 })).toEqual({
      cleaner: 80n * U,
      manager: 138n * U,
      owner: 782n * U,
    });
  });

  it("management fee floors and the owner absorbs the remainder (zero dust)", () => {
    // net = 1 micro-USDC * 3 at 33.33% → mgmt floors to 0
    const s = splitCollected({ collected: 3n, cleaningFee: 0n, mgmtFeeBps: 3333 });
    expect(s).toEqual({ cleaner: 0n, manager: 0n, owner: 3n });
  });

  it("cleaning fee larger than collected goes entirely to the cleaner", () => {
    expect(splitCollected({ collected: 50n * U, cleaningFee: 80n * U, mgmtFeeBps: 1500 })).toEqual({
      cleaner: 50n * U,
      manager: 0n,
      owner: 0n,
    });
  });

  it("0% and 100% management fee", () => {
    expect(splitCollected({ collected: 100n, cleaningFee: 10n, mgmtFeeBps: 0 })).toEqual({ cleaner: 10n, manager: 0n, owner: 90n });
    expect(splitCollected({ collected: 100n, cleaningFee: 10n, mgmtFeeBps: 10_000 })).toEqual({ cleaner: 10n, manager: 90n, owner: 0n });
  });

  it.each([
    [{ collected: -1n, cleaningFee: 0n, mgmtFeeBps: 0 }],
    [{ collected: 1n, cleaningFee: -1n, mgmtFeeBps: 0 }],
    [{ collected: 1n, cleaningFee: 0n, mgmtFeeBps: -1 }],
    [{ collected: 1n, cleaningFee: 0n, mgmtFeeBps: 10_001 }],
    [{ collected: 1n, cleaningFee: 0n, mgmtFeeBps: 12.5 }],
  ])("rejects invalid input %#", (input) => {
    expect(() => splitCollected(input)).toThrow();
  });

  const arb = fc.record({
    collected: fc.bigInt({ min: 0n, max: 10n ** 18n }),
    cleaningFee: fc.bigInt({ min: 0n, max: 10n ** 18n }),
    mgmtFeeBps: fc.integer({ min: 0, max: 10_000 }),
  });

  it("property: parts always sum to collected, all non-negative", () => {
    fc.assert(
      fc.property(arb, (i) => {
        const s = splitCollected(i);
        expect(s.cleaner + s.manager + s.owner).toBe(i.collected);
        expect(s.cleaner >= 0n && s.manager >= 0n && s.owner >= 0n).toBe(true);
      }),
      { numRuns: 2_000 },
    );
  });

  it("property: cleaner gets min(fee, collected); manager is the floored percentage of the rest", () => {
    fc.assert(
      fc.property(arb, (i) => {
        const s = splitCollected(i);
        const cleaner = i.cleaningFee < i.collected ? i.cleaningFee : i.collected;
        expect(s.cleaner).toBe(cleaner);
        expect(s.manager).toBe(((i.collected - cleaner) * BigInt(i.mgmtFeeBps)) / 10_000n);
      }),
      { numRuns: 2_000 },
    );
  });
});

describe("splitBooking: penalties", () => {
  it("penalties go 100% to the owner unless marked operator revenue", () => {
    const s = splitBooking({
      collected: 1_000n * U,
      cleaningFee: 80n * U,
      mgmtFeeBps: 1500,
      penalties: [
        { amount: 200n * U, operatorRevenue: false }, // damage → owner
        { amount: 25n * U, operatorRevenue: true }, // late-checkout fee → operator
      ],
    });
    expect(s).toEqual({ cleaner: 80n * U, manager: 163n * U, owner: 982n * U });
  });

  it("property: booking total = collected + all penalties", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 15n }),
        fc.bigInt({ min: 0n, max: 10n ** 15n }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.array(fc.record({ amount: fc.bigInt({ min: 0n, max: 10n ** 12n }), operatorRevenue: fc.boolean() }), { maxLength: 5 }),
        (collected, cleaningFee, mgmtFeeBps, penalties) => {
          const s = splitBooking({ collected, cleaningFee, mgmtFeeBps, penalties });
          const p = penalties.reduce((a, x) => a + x.amount, 0n);
          expect(s.cleaner + s.manager + s.owner).toBe(collected + p);
        },
      ),
    );
  });
});

describe("payoutItems", () => {
  const split = { cleaner: 80n * U, manager: 138n * U, owner: 782n * U };
  const payees = { owner: "owen.testnet", cleaner: "maria.testnet" };

  it("one item per paid role, keyed booking:role; manager share is retained (no item)", () => {
    expect(payoutItems("bk_123", split, payees)).toEqual([
      { key: "bk_123:owner", payee: "owen.testnet", amount: 782n * U },
      { key: "bk_123:cleaner", payee: "maria.testnet", amount: 80n * U },
    ]);
  });

  it("skips zero amounts (the vault rejects them as InvalidItem)", () => {
    expect(payoutItems("bk_1", { cleaner: 0n, manager: 5n, owner: 7n }, payees)).toEqual([
      { key: "bk_1:owner", payee: "owen.testnet", amount: 7n },
    ]);
  });

  it("rejects keys longer than the vault allows (64 bytes)", () => {
    expect(() => payoutItems("b".repeat(60), split, payees)).toThrow(/64/);
  });
});
