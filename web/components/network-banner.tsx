import { networkId } from "@/lib/near/network";

/** Stripe-style test-mode bar. Never subtle on testnet; absent on mainnet. */
export function NetworkBanner() {
  if (networkId() === "mainnet") return null;
  return (
    <div role="status" data-testid="network-banner-testnet" className="bg-warning-soft px-4 py-1 text-center text-xs font-medium text-warning">
      Test mode · NEAR testnet · mock USDC. No real money moves.
    </div>
  );
}
