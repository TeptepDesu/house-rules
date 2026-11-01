import { describe, expect, it } from "vitest";
import { describeRules, formatDurationNs, payeeVaultStatus } from "./rules";

const U = 1_000_000n;
const SEC = 1_000_000_000n;
const HOUR = 3_600n * SEC;
const NOW = 100n * HOUR;

describe("formatDurationNs", () => {
  it.each([
    [0n, "No waiting period"],
    [30n * SEC, "30 seconds"],
    [60n * SEC, "1 minute"],
    [10n * 60n * SEC, "10 minutes"],
    [HOUR, "1 hour"],
    [24n * HOUR, "24 hours"],
    [90n * 60n * SEC, "1 hour 30 minutes"],
    [72n * HOUR, "3 days"],
  ])("%s ns → %s", (ns, out) => expect(formatDurationNs(ns)).toBe(out));
});

describe("payeeVaultStatus (chain → app status)", () => {
  const chain = { accountId: "owen.testnet", role: "owner" as const, capPerPayout: U, payableFromNs: NOW + HOUR, active: true };
  it("not on the vault yet → needs signature", () => expect(payeeVaultStatus(undefined, NOW)).toBe("pending_signature"));
  it("added but still waiting → in delay", () => expect(payeeVaultStatus(chain, NOW)).toBe("in_delay"));
  it("waiting period over → active (boundary inclusive)", () => expect(payeeVaultStatus({ ...chain, payableFromNs: NOW }, NOW)).toBe("active"));
  it("removed on-chain → removed", () => expect(payeeVaultStatus({ ...chain, active: false }, NOW)).toBe("removed"));
});

describe("describeRules", () => {
  const policy = { dailyLimit: 3_000n * U, payeeDelayNs: 24n * HOUR, agent: "agent.testnet", owner: "op.testnet", maxBatch: 40 };
  const chain = [
    { accountId: "owen.testnet", role: "owner" as const, capPerPayout: 800n * U, payableFromNs: 0n, active: true },
    { accountId: "maria.testnet", role: "cleaner" as const, capPerPayout: 100n * U, payableFromNs: NOW + 2n * HOUR, active: true },
    { accountId: "old.testnet", role: "cleaner" as const, capPerPayout: 50n * U, payableFromNs: 0n, active: false },
  ];
  const names = new Map([
    ["owen.testnet", "Owen Reyes"],
    ["maria.testnet", "Maria Santos"],
  ]);
  const r = describeRules({ policy, payees: chain, names, remainingToday: 2_126n * U, nowNs: NOW });

  it("allowlist sentence counts only active payees; lists everyone with their state", () => {
    expect(r.allowlist.title).toBe("Pays only these 2 people");
    expect(r.allowlist.payees.map((p) => [p.name, p.status])).toEqual([
      ["Owen Reyes", "active"],
      ["Maria Santos", "in_delay"],
      ["old.testnet", "removed"], // unknown to the app → shown by account
    ]);
  });

  it("caps, daily limit and delay as sentences", () => {
    expect(r.cap.title).toBe("At most $800.00 per payout");
    expect(r.cap.detail).toBe("Owner up to $800.00 · Cleaner up to $100.00");
    expect(r.daily.title).toBe("Up to $3,000.00 per day");
    expect(r.daily.detail).toBe("$2,126.00 left today");
    expect(r.delay.title).toBe("New payees wait 24 hours");
    expect(r.once.title).toBe("Each booking is paid once");
  });

  it("a single-payee allowlist reads naturally", () => {
    const one = describeRules({ policy, payees: [chain[0]], names, remainingToday: 0n, nowNs: NOW });
    expect(one.allowlist.title).toBe("Pays only this 1 person");
  });

  it("no waiting period reads as such", () => {
    const r0 = describeRules({ policy: { ...policy, payeeDelayNs: 0n }, payees: [], names, remainingToday: 0n, nowNs: NOW });
    expect(r0.delay.title).toBe("New payees can be paid right away");
    expect(r0.allowlist.title).toBe("Pays no one yet");
  });
});
