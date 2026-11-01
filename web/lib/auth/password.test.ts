import { describe, expect, it } from "vitest";
import { dummyHash, hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h).not.toContain("correct horse battery");
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("dummy hash is a real bcrypt hash that matches nothing user-supplied", async () => {
    const h = await dummyHash();
    expect(h).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword("", h)).toBe(false);
  });
});
