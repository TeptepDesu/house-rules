import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { VaultForm } from "@/components/settings/vault-form";
import { requireUser } from "@/lib/auth/dal";
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
  const vault = await getVaultAccount(user.id);
  const network = networkId();
  return (
    <section aria-labelledby="vault-title" className="max-w-xl rounded-[10px] border bg-card p-4">
      <h2 id="vault-title" className="text-[15px] font-semibold">
        Your vault
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        The NEAR contract that holds your USDC and enforces your payout rules. Guest payments are delivered here.
      </p>
      <VaultForm current={vault} example={network === "mainnet" ? "vault.yourname.near" : "vault.yourname.testnet"} />
    </section>
  );
}
