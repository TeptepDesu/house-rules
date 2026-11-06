import { networkId } from "@/lib/near/network";

/** Test-mode bar. Never subtle on testnet; absent on mainnet. */
export function NetworkBanner() {
  if (networkId() === "mainnet") return null;
  return (
    <div role="status" data-testid="network-banner-testnet" className="label-caps bg-warning-soft px-4 py-1.5 text-center text-warning">
      Test mode · NEAR testnet · mock USDC. No real money moves.
    </div>
  );
}
