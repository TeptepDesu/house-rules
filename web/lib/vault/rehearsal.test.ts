import { describe, expect, it } from "vitest";
import { REHEARSAL_DAILY_LIMIT, createRehearsalVault, newRehearsalStore } from "./rehearsal";

const U = 1_000_000n;
const H = 3_600n * 1_000_000_000n;
const payees = [
  { nearAccount: "owen.testnet", role: "owner" as const, capRaw: 800n * U, vaultStatus: "active" as const },
  { nearAccount: "maria.testnet", role: "cleaner" as const, capRaw: 100n * U, vaultStatus: "active" as const },
  { nearAccount: "new.testnet", role: "cleaner" as const, capRaw: 100n * U, vaultStatus: "pending_signature" as const },
  { nearAccount: "gone.testnet", role: "owner" as const, capRaw: 100n * U, vaultStatus: "removed" as const },
];

function setup(start = 1_000n * H) {
  let now = start;
  const store = newRehearsalStore();
  const vault = createRehearsalVault("op-1", async () => payees, store, () => now);
  return { vault, store, advance: (ns: bigint) => (now += ns) };
}
const item = (key: string, payee: string, amount: bigint) => ({ key, payee, amount });

describe("rehearsal vault applies the same rules as the real vault", () => {
  it("a key repeated inside one batch is AlreadyPaid, like the contract (docs/vault-spec.md)", async () => {
    const { vault } = setup();
    const r = await vault.settle([item("b9:owner", "owen.testnet", 10n * U), item("b9:owner", "owen.testnet", 10n * U)], 100);
    expect(r).toMatchObject({ kind: "rejected", code: "AlreadyPaid" });
  });

  it("only approved payees are on its list", async () => {
    const { vault } = setup();
    expect((await vault.getPayees()).map((p) => p.accountId)).toEqual(["owen.testnet", "maria.testnet"]);
  });

  it("refuses an unapproved payee, an amount over the cap and a key paid before; a refused batch pays nothing", async () => {
    const { vault } = setup();
    expect(await vault.settle([item("b1:owner", "owen.testnet", 10n * U), item("b1:cleaner", "new.testnet", U)], 100)).toMatchObject({ kind: "rejected", code: "PayeeNotAllowed" });
    expect(await vault.paidKeys(["b1:owner"])).toEqual(new Set()); // atomic: Owen's item wasn't paid either
    expect(await vault.settle([item("b2:cleaner", "maria.testnet", 100n * U + 1n)], 100)).toMatchObject({ kind: "rejected", code: "OverCap" });
    expect(await vault.settle([item("b3:owner", "owen.testnet", 10n * U)], 100)).toMatchObject({ kind: "paid", keys: ["b3:owner"], total: 10n * U });
    expect(await vault.settle([item("b3:owner", "owen.testnet", 10n * U)], 100)).toMatchObject({ kind: "rejected", code: "AlreadyPaid" });
  });

  it("spends from a 24-hour daily limit that resets like the contract's window", async () => {
    const { vault, advance } = setup();
    expect(await vault.remainingToday()).toBe(REHEARSAL_DAILY_LIMIT);
    await vault.settle([item("a:owner", "owen.testnet", 800n * U)], 100);
    expect(await vault.remainingToday()).toBe(REHEARSAL_DAILY_LIMIT - 800n * U);

    // a batch that would go over the remaining limit is refused whole
    const many = Array.from({ length: 25 }, (_, i) => item(`m${i}:owner`, "owen.testnet", 800n * U));
    expect(await vault.settle(many, 100)).toMatchObject({ kind: "rejected", code: "DailyLimitExceeded" });

    advance(23n * H);
    expect(await vault.remainingToday()).toBe(REHEARSAL_DAILY_LIMIT - 800n * U);
    advance(1n * H);
    expect(await vault.remainingToday()).toBe(REHEARSAL_DAILY_LIMIT);
  });

  it("keeps each operator's spend separate, and emits the real vault's event shapes", async () => {
    const store = newRehearsalStore();
    const a = createRehearsalVault("op-a", async () => payees, store, () => 0n);
    const b = createRehearsalVault("op-b", async () => payees, store, () => 0n);
    const r = await a.settle([item("x:owner", "owen.testnet", 5n * U)], 100);
    expect(await b.remainingToday()).toBe(REHEARSAL_DAILY_LIMIT);
    if (r.kind !== "paid") throw new Error("expected paid");
    expect(r.events?.map((e) => e.event)).toEqual(["settle_started", "settled"]);
  });
});
