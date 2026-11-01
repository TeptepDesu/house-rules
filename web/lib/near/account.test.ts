import { describe, expect, it } from "vitest";
import { checkAccountForNetwork, isValidAccountId } from "./account";

describe("isValidAccountId (NEAR rules)", () => {
  it.each(["maria.testnet", "houserules-owner-1.testnet", "a1", "vault.op.near", "x_y.near", "0".repeat(64)])("accepts %s", (a) =>
    expect(isValidAccountId(a)).toBe(true),
  );
  it.each(["", "a", "Maria.testnet", "maria..testnet", ".maria", "maria.", "-x.near", "x-.near", "a b", "x".repeat(65), "maria@testnet"])(
    "rejects %j",
    (a) => expect(isValidAccountId(a)).toBe(false),
  );
});

describe("checkAccountForNetwork", () => {
  it("testnet deployments only accept .testnet or implicit accounts", () => {
    expect(checkAccountForNetwork("maria.testnet", "testnet")).toBeNull();
    expect(checkAccountForNetwork("a".repeat(64), "testnet")).toBeNull();
    expect(checkAccountForNetwork("maria.near", "testnet")).toMatch(/testnet/);
  });
  it("mainnet deployments never accept .testnet accounts", () => {
    expect(checkAccountForNetwork("maria.near", "mainnet")).toBeNull();
    expect(checkAccountForNetwork("maria.testnet", "mainnet")).toMatch(/mainnet/);
  });
  it("explains invalid ids", () => expect(checkAccountForNetwork("Maria", "testnet")).toMatch(/valid NEAR account/));
});
