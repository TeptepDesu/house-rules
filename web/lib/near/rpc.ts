import "server-only";
import type { TxOutcome } from "./outcome";
import { type NetworkId, networkId } from "./network";

// Minimal NEAR JSON-RPC reads used for on-chain verification.

export function rpcUrl(network: NetworkId = networkId(), env: Record<string, string | undefined> = process.env): string {
  return env.NEAR_RPC_URL || (network === "mainnet" ? "https://rpc.mainnet.near.org" : "https://rpc.testnet.near.org");
}

/** Final outcome of a tx, or null if the RPC doesn't know it (wrong sender, not final, etc.). */
export async function fetchTxOutcome(txHash: string, senderAccountId: string, fetchImpl: typeof fetch = fetch): Promise<TxOutcome | null> {
  const res = await fetchImpl(rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "hr", method: "tx", params: { tx_hash: txHash, sender_account_id: senderAccountId, wait_until: "FINAL" } }),
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { result?: TxOutcome } | null;
  return body?.result ?? null;
}
