import { describe, expect, it } from "vitest";
import { shortDate, stayRange } from "./format";

describe("date formatting", () => {
  it("formats calendar dates without timezone drift", () => {
    expect(shortDate("2026-10-01")).toBe("Oct 1");
    expect(shortDate("2026-12-31")).toBe("Dec 31");
  });
  it("formats a stay", () => expect(stayRange("2026-10-30", "2026-11-02")).toBe("Oct 30 – Nov 2"));
});
