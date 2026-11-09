// What a guest can pay with on the pay page. Pure, so the server filters and the client labels
// from one list. Only chains whose deposits need no memo. Memo chains (Stellar, TON) may share
// deposit addresses, and the payments table allows one row per deposit address. The memo is
// still saved and sent with every status check, in case 1Click returns one on these chains too.

export const GUEST_CHAINS: Record<string, string> = {
  arb: "Arbitrum",
  base: "Base",
  eth: "Ethereum",
  sol: "Solana",
  near: "NEAR",
  btc: "Bitcoin",
  bsc: "BNB Chain",
  pol: "Polygon",
};

const GUEST_SYMBOLS = new Set(["USDC", "USDT", "ETH", "SOL", "NEAR", "BTC"]);

export function guestPayOptions<T extends { symbol: string; blockchain: string }>(all: T[]): T[] {
  return all.filter((t) => GUEST_SYMBOLS.has(t.symbol) && Object.hasOwn(GUEST_CHAINS, t.blockchain));
}
