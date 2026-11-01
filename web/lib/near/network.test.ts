import { describe, expect, it } from "vitest";
import { explorerTxUrl, networkId } from "./network";

describe("network", () => {
  it("defaults to testnet; only an explicit 'mainnet' means real money", () => {
    expect(networkId({})).toBe("testnet");
    expect(networkId({ NEAR_NETWORK: "Mainnet" })).toBe("testnet");
    expect(networkId({ NEAR_NETWORK: "mainnet" })).toBe("mainnet");
  });
  it("links txs to the right explorer", () => {
    expect(explorerTxUrl("Abc", "testnet")).toBe("https://testnet.nearblocks.io/txns/Abc");
    expect(explorerTxUrl("Abc", "mainnet")).toBe("https://nearblocks.io/txns/Abc");
  });
});
