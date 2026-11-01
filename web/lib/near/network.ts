// Which NEAR network this deployment talks to. Fixed per deployment via NEAR_NETWORK.
export type NetworkId = "testnet" | "mainnet";

export function networkId(env: Record<string, string | undefined> = process.env): NetworkId {
  return env.NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
}

export function explorerTxUrl(hash: string, network: NetworkId): string {
  return `${network === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io"}/txns/${encodeURIComponent(hash)}`;
}

export function explorerAccountUrl(account: string, network: NetworkId): string {
  return `${network === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io"}/address/${encodeURIComponent(account)}`;
}
