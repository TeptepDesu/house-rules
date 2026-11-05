import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { FORMATS, detectFormat, importReport, mapRows, summarize } from "./index";

const fixture = (name: string) => readFileSync(new URL(`../../test/fixtures/payout-reports/${name}`, import.meta.url), "utf8");
const U = 1_000_000n;
const properties = [
  { id: "p-casa", name: "Casa Azul" },
  { id: "p-loft", name: "Loft 21" },
  { id: "p-sea", name: "seaside cottage " }, // matching is case/space-insensitive
];

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas, CRLF, BOM and blank lines", () => {
    const rows = parseCsv('﻿a,b,c\r\n"Lopez, Maria","say ""hi""",3\r\n\r\nx,,z\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["Lopez, Maria", 'say "hi"', "3"],
      ["x", "", "z"],
    ]);
  });
  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a,"b\n')).toThrow(/quote/);
  });
});

describe("detectFormat", () => {
  it.each([
    ["airbnb-style.csv", "airbnb"],
    ["booking-style.csv", "booking_com"],
    ["guesty-style.csv", "guesty"],
  ])("%s → %s", (file, id) => {
    expect(detectFormat(parseCsv(fixture(file))[0])?.id).toBe(id);
  });
  it("unknown headers → null (manual column mapping)", () => {
    expect(detectFormat(["Ref", "Arrive", "Leave", "Who", "Unit", "Net $"])).toBeNull();
  });
});

describe("small report (mainnet demo file)", () => {
  const r = importReport(fixture("airbnb-style-small.csv"), { properties, existing: new Map() });

  it("imports cleanly and totals under the $30 the mainnet demo holds", () => {
    expect(r.format).toBe("airbnb");
    expect(summarize(r.rows)).toEqual({ ok: 4, flagged: 0, duplicate: 0, ignored: 0 });
    const total = r.rows.reduce((a, row) => a + (row.booking?.payout ?? 0n), 0n);
    expect(total).toBe(26_270_000n);
    expect(total).toBeLessThan(30n * U);
  });

  it("has exactly one short booking, by $1.85, so the blocked state still shows on camera", () => {
    const short = r.rows.filter((row) => row.booking!.payout !== row.booking!.expectedNet);
    expect(short.map((row) => row.ref)).toEqual(["HM5003X"]);
    expect(short[0].booking!.expectedNet! - short[0].booking!.payout!).toBe(1_850_000n);
  });
});

describe("Airbnb-style report (demo file)", () => {
  const r = importReport(fixture("airbnb-style.csv"), { properties, existing: new Map() });

  it("summary: 22 will match, 2 flagged, 1 duplicate (payout + adjustment rows ignored)", () => {
    expect(r.format).toBe("airbnb");
    expect(summarize(r.rows)).toEqual({ ok: 22, flagged: 2, duplicate: 1, ignored: 2 });
    expect(r.summaryText).toBe("22 will match, 2 flagged, 1 duplicate");
  });

  it("flags non-USD and unknown listings with reasons", () => {
    const flagged = r.rows.filter((x) => x.status === "flagged").map((x) => [x.ref, x.reason]);
    expect(flagged).toEqual([
      ["HM4006X", "non_usd"],
      ["HM4017X", "unknown_listing"],
    ]);
  });

  it("normalizes a row: dates, raw amounts, property, expected net from gross − fee", () => {
    const row = r.rows.find((x) => x.ref === "HM4000X")!;
    expect(row.status).toBe("new");
    expect(row.booking).toEqual({
      channel: "airbnb",
      externalRef: "HM4000X",
      guestName: "Ana Reyes",
      propertyId: "p-casa",
      checkIn: "2026-10-01",
      checkOut: "2026-10-03",
      payout: 368_600_000n,
      expectedNet: 368_600_000n,
      cleaningFee: 80n * U,
    });
  });

  it("keeps the channel's underpayment visible for reconciliation (payout < expected net)", () => {
    const b = r.rows.find((x) => x.ref === "HM4009X")!.booking!;
    expect(b.expectedNet - b.payout).toBe(20n * U);
  });

  it("parses quoted names with commas", () => {
    expect(r.rows.find((x) => x.ref === "HM4011X")!.booking!.guestName).toBe("Lopez, Maria");
  });
});

describe("re-importing", () => {
  it("already imported with the same payout → duplicate; known booking without payout → update; different payout → flagged", () => {
    const existing = new Map([
      ["airbnb:HM4000X", { otaPayout: 368_600_000n }],
      ["airbnb:HM4001X", { otaPayout: undefined }],
      ["airbnb:HM4002X", { otaPayout: 1n }],
    ]);
    const r = importReport(fixture("airbnb-style.csv"), { properties, existing });
    const st = (ref: string) => r.rows.find((x) => x.ref === ref)!;
    expect(st("HM4000X").status).toBe("duplicate");
    expect(st("HM4001X").status).toBe("update");
    expect(st("HM4002X")).toMatchObject({ status: "flagged", reason: "payout_changed" });
  });
});

describe("Booking.com-style statement", () => {
  const r = importReport(fixture("booking-style.csv"), { properties, existing: new Map() });
  it("cancelled rows are ignored; the same reservation with two different payouts is flagged (both rows)", () => {
    expect(r.format).toBe("booking_com");
    expect(summarize(r.rows)).toEqual({ ok: 3, flagged: 2, duplicate: 0, ignored: 1 });
    expect(r.rows.filter((x) => x.status === "flagged").map((x) => x.reason)).toEqual(["conflicting_duplicate", "conflicting_duplicate"]);
  });
  it("uses the statement's payout as both payout and expected net", () => {
    const b = r.rows.find((x) => x.ref === "4410023002")!.booking!;
    expect(b).toMatchObject({ checkIn: "2026-10-06", payout: 280_500_000n, expectedNet: 280_500_000n, propertyId: "p-casa" });
  });
});

describe("Guesty-style export", () => {
  const r = importReport(fixture("guesty-style.csv"), { properties, existing: new Map() });
  it("strips the BOM, flags impossible dates", () => {
    expect(r.format).toBe("guesty");
    expect(summarize(r.rows)).toEqual({ ok: 3, flagged: 1, duplicate: 0, ignored: 0 });
    expect(r.rows.find((x) => x.status === "flagged")).toMatchObject({ reason: "invalid_date", line: 4 });
  });
});

describe("manual column mapping (unknown format)", () => {
  const csv = "Ref,Arrive,Leave,Who,Unit,Net $\nX-1,2026-10-01,2026-10-03,Kai Lee,Loft 21,\"1,200.00\"\nX-2,2026-10-04,2026-10-02,Lu Chen,Loft 21,50\n";

  it("importReport returns unknown + headers instead of guessing", () => {
    const r = importReport(csv, { properties, existing: new Map() });
    expect(r.format).toBe("unknown");
    expect(r.headers).toEqual(["Ref", "Arrive", "Leave", "Who", "Unit", "Net $"]);
    expect(r.rows).toEqual([]);
  });

  it("maps with operator-chosen columns through the same pipeline", () => {
    const rows = mapRows(
      parseCsv(csv),
      { id: "manual", channel: "other", columns: { externalRef: "Ref", checkIn: "Arrive", checkOut: "Leave", guestName: "Who", listing: "Unit", payout: "Net $" }, dateFormat: "YMD" },
      { properties, existing: new Map() },
    );
    expect(rows[0]).toMatchObject({ status: "new", booking: { externalRef: "X-1", payout: 1_200n * U } });
    expect(rows[1]).toMatchObject({ status: "flagged", reason: "invalid_date" }); // check-out before check-in
  });

  it("every built-in format is itself just a column mapping", () => {
    expect(FORMATS.map((f) => f.id)).toEqual(["airbnb", "booking_com", "guesty"]);
  });
});
