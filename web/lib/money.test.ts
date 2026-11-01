import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { USDC_DECIMALS, formatUsd, fromApiAmount, parseUsd, toApiAmount } from "./money";

const U = 1_000_000n; // 1 USDC

describe("formatUsd", () => {
  it.each([
    [0n, "$0.00"],
    [1n, "$0.00"],
    [4_999n, "$0.00"],
    [5_000n, "$0.01"], // half a cent rounds up
    [1_234_560_000n, "$1,234.56"],
    [800n * U, "$800.00"],
    [1_000_000n * U, "$1,000,000.00"],
    [-1_500_000n, "-$1.50"],
    [999_995_000n, "$1,000.00"],
  ])("%s → %s", (raw, out) => {
    expect(formatUsd(raw)).toBe(out);
  });

  it("can show full precision", () => {
    expect(formatUsd(1_234_567n, { exact: true })).toBe("$1.234567");
    expect(formatUsd(1_000_000n, { exact: true })).toBe("$1.00");
  });
});

describe("parseUsd", () => {
  it.each([
    ["0", 0n],
    ["800", 800n * U],
    ["$1,234.56", 1_234_560_000n],
    ["0.000001", 1n],
    [" 12.5 ", 12_500_000n],
  ])("%s → %s", (s, raw) => {
    expect(parseUsd(s)).toBe(raw);
  });

  it.each(["", "abc", "1.2345678", "-5", "1e6", "1..2", "1,23.4,5", "$"])("rejects %j", (s) => {
    expect(() => parseUsd(s)).toThrow();
  });

  it("round-trips with exact formatting", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 15n }), (raw) => {
        expect(parseUsd(formatUsd(raw, { exact: true }))).toBe(raw);
      }),
    );
  });
});

describe("API amounts", () => {
  it("serialize as decimal strings and parse back", () => {
    expect(toApiAmount(123n)).toBe("123");
    expect(fromApiAmount("123")).toBe(123n);
  });
  it.each(["", "-1", "1.5", "0x10", "12a", " 1"])("fromApiAmount rejects %j", (s) => {
    expect(() => fromApiAmount(s)).toThrow();
  });
  it("uses 6 decimals", () => expect(USDC_DECIMALS).toBe(6));
});

describe("percentages", async () => {
  const { formatBps, parsePercentToBps } = await import("./money");
  it.each([
    ["15", 1500],
    ["15%", 1500],
    ["12.5", 1250],
    ["0", 0],
    ["100", 10_000],
    ["0.01", 1],
  ])("%s → %s bps", (s, bps) => expect(parsePercentToBps(s)).toBe(bps));
  it.each(["", "-1", "100.01", "abc", "1.234", "1000"])("rejects %j", (s) => expect(() => parsePercentToBps(s)).toThrow());
  it.each([
    [1500, "15%"],
    [1250, "12.5%"],
    [1, "0.01%"],
    [0, "0%"],
  ])("%s bps → %s", (bps, s) => expect(formatBps(bps)).toBe(s));
});
