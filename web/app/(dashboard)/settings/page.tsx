import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { VaultForm } from "@/components/settings/vault-form";
import { WalletLink } from "@/components/settings/wallet-link";
import { agentMode } from "@/lib/agent/vault-factory";
import { requireUser } from "@/lib/auth/dal";
import { getOperatorAccount } from "@/lib/db";
import { getVaultAccount } from "@/lib/db/invoices";
import { networkId } from "@/lib/near/network";

export const metadata: Metadata = { title: "Settings · House Rules" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Where guest payments land and where payouts come from." />
      <Suspense fallback={<p className="text-sm text-muted-foreground" data-testid="settings-loading">Loading…</p>}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  const user = await requireUser();
  const [vault, operator] = await Promise.all([getVaultAccount(user.id), getOperatorAccount(user.id)]);
  const network = networkId();
  const live = agentMode() === "live";
  return (
    <div className="grid max-w-xl gap-4">
      <section aria-labelledby="wallet-title" className="rounded-[10px] border bg-card p-4">
        <h2 id="wallet-title" className="text-[15px] font-semibold">
          Your NEAR wallet
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          You sign a one-time message to prove this account is yours. Only a vault owned by it can be connected, and only it can approve payees.
        </p>
        {live ? (
          <WalletLink linked={operator} />
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="wallet-rehearsal">
            Rehearsal mode: no wallet needed. Each account&apos;s simulated vault is its own.
          </p>
        )}
      </section>
      <section aria-labelledby="vault-title" className="rounded-[10px] border bg-card p-4">
        <h2 id="vault-title" className="text-[15px] font-semibold">
          Your vault
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          The NEAR contract that holds your USDC and enforces your payout rules. Guest payments are delivered here.
          {live && " We check on-chain that it's owned by your linked wallet."}
        </p>
        <VaultForm current={vault} example={network === "mainnet" ? "vault.yourname.near" : "vault.yourname.testnet"} />
      </section>
    </div>
  );
}
