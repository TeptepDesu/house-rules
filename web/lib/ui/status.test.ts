import { describe, expect, it } from "vitest";
import * as s from "@/lib/db/schema";
import { STATUS_MAPS, statusOf } from "./status";

// Every DB enum value has a label; drift between schema and UI fails here.
const cases: [keyof typeof STATUS_MAPS, readonly string[]][] = [
  ["payee", s.payeeVaultStatus.enumValues],
  ["booking", s.settlementStatus.enumValues],
  ["invoice", s.invoiceStatus.enumValues],
  ["payment", s.paymentStatus.enumValues],
  ["split", s.splitStatus.enumValues],
  ["run", s.runStatus.enumValues],
  ["recon", s.reconResult.enumValues],
];

describe("status map", () => {
  it.each(cases)("covers every %s status in the schema, and nothing extra", (kind, values) => {
    expect(Object.keys(STATUS_MAPS[kind]).sort()).toEqual([...values].sort());
  });
  it("reads plain-language labels", () => {
    expect(statusOf("booking", "blocked")).toEqual({ label: "Blocked", tone: "destructive" });
    expect(statusOf("split", "retained").label).toBe("Kept in vault");
  });
});
