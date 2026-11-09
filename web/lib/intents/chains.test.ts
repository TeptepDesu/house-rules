import { describe, expect, it } from "vitest";
import { GUEST_CHAINS, guestPayOptions } from "./chains";

const t = (symbol: string, blockchain: string) => ({ assetId: `${blockchain}:${symbol}`, symbol, blockchain, decimals: 6 });

describe("guestPayOptions", () => {
  it("keeps the shown symbols on the labelled chains", () => {
    const all = [t("USDC", "base"), t("USDC", "arb"), t("ETH", "eth"), t("SOL", "sol"), t("NEAR", "near"), t("BTC", "btc"), t("USDT", "bsc"), t("USDC", "pol")];
    expect(guestPayOptions(all)).toEqual(all);
  });

  it("drops chains whose deposits need a memo (Stellar, TON) and chains the pay page can't name", () => {
    const all = [t("USDC", "stellar"), t("USDT", "ton"), t("USDC", "aptos"), t("USDC", "sui"), t("USDT", "tron"), t("USDC", "base")];
    expect(guestPayOptions(all).map((x) => x.blockchain)).toEqual(["base"]);
  });

  it("drops symbols the pay page doesn't offer, even on a labelled chain", () => {
    expect(guestPayOptions([t("DOGE", "base"), t("wNEAR", "near")])).toEqual([]);
  });

  it("every allowed chain has a display name", () => {
    for (const [id, name] of Object.entries(GUEST_CHAINS)) expect(name.length, id).toBeGreaterThan(0);
  });
});
