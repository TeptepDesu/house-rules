import { describe, expect, it } from "vitest";
import { formatUnits } from "./format";

describe("formatUnits", () => {
  it.each([
    ["125600000", 6, "125.6"],
    ["1", 6, "0.000001"],
    ["1000000", 6, "1"],
    ["0", 18, "0"],
    ["1500000000000000000", 18, "1.5"],
    ["123456789012345678", 18, "0.12345679"], // rounded UP at 8 decimals: never ask for too little
    ["99999999999", 18, "0.0000001"],
    ["5", 0, "5"],
  ])("%s with %s decimals → %s", (raw, d, out) => expect(formatUnits(raw, d)).toBe(out));
  it("rounding up can carry into the whole part", () => expect(formatUnits("999999999999999999", 18)).toBe("1"));
  it("rejects non-integers", () => expect(() => formatUnits("1.5", 6)).toThrow());
});
