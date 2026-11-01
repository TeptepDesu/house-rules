import { describe, expect, it } from "vitest";
import { planBookingPayouts } from "./plan";

const U = 1_000_000n;
const casa = { id: "p1", cleaningFeeRaw: 80n * U, mgmtFeeBps: 1500, ownerAccount: "owen.testnet", cleanerAccount: "maria.testnet" };

describe("planBookingPayouts", () => {
  it("$1,000 collected, $80 cleaning, 15% mgmt → cleaner $80, owner $782, manager $138 retained", () => {
    const [p] = planBookingPayouts([{ id: "bk1", propertyId: "p1", collected: 1_000n * U, penalties: [] }], [casa]);
    expect(p.split).toEqual({ cleaner: 80n * U, manager: 138n * U, owner: 782n * U });
    expect(p.items).toEqual([
      { key: "bk1:owner", payee: "owen.testnet", amount: 782n * U },
      { key: "bk1:cleaner", payee: "maria.testnet", amount: 80n * U },
    ]);
    expect(p.problem).toBeUndefined();
  });

  it("a per-booking cleaning fee override wins over the property's", () => {
    const [p] = planBookingPayouts([{ id: "bk1", propertyId: "p1", collected: 100n * U, cleaningFeeOverride: 50n * U, penalties: [] }], [casa]);
    expect(p.split.cleaner).toBe(50n * U);
  });

  it("paid penalties go to the owner unless they're operator revenue", () => {
    const [p] = planBookingPayouts(
      [{ id: "bk1", propertyId: "p1", collected: 1_000n * U, penalties: [{ amount: 200n * U, operatorRevenue: false }, { amount: 25n * U, operatorRevenue: true }] }],
      [casa],
    );
    expect(p.split).toEqual({ cleaner: 80n * U, manager: 163n * U, owner: 982n * U });
  });

  it("missing payees are a problem for that booking (nothing planned), not a crash", () => {
    const noCleaner = { ...casa, id: "p2", cleanerAccount: null };
    const noOwner = { ...casa, id: "p3", ownerAccount: null };
    const plans = planBookingPayouts(
      [
        { id: "a", propertyId: "p2", collected: 100n * U, penalties: [] },
        { id: "b", propertyId: "p3", collected: 100n * U, penalties: [] },
        { id: "c", propertyId: "missing", collected: 100n * U, penalties: [] },
      ],
      [noCleaner, noOwner],
    );
    expect(plans.map((p) => [p.bookingId, p.problem, p.items.length])).toEqual([
      ["a", "no_cleaner_payee", 0],
      ["b", "no_owner_payee", 0],
      ["c", "no_property", 0],
    ]);
  });

  it("a property with no cleaning fee doesn't need a cleaner", () => {
    const [p] = planBookingPayouts([{ id: "bk1", propertyId: "p1", collected: 100n * U, penalties: [] }], [{ ...casa, cleaningFeeRaw: 0n, cleanerAccount: null }]);
    expect(p.problem).toBeUndefined();
    expect(p.items.map((i) => i.key)).toEqual(["bk1:owner"]);
  });
});
