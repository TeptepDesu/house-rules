import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Money } from "@/components/money";
import { PayFlow } from "@/components/pay/pay-flow";
import { PropertyCover } from "@/components/property-cover";
import { StatusPill } from "@/components/status-pill";
import { getPublicInvoice } from "@/lib/db/invoices";
import { oneClickMode } from "@/lib/intents/provider";
import { networkId } from "@/lib/near/network";
import { stayRange } from "@/lib/ui/format";

// Guest pay page (design.md § Layout): no app chrome, one column, one action.
export const metadata: Metadata = { title: "Pay invoice", robots: { index: false, follow: false } };

const KIND = { booking: "Booking", extension: "Stay extension", penalty: "Charge", deposit: "Deposit" } as const;

export default function PayPage({ params }: PageProps<"/pay/[publicId]">) {
  return (
    <main className="flex flex-1 justify-center px-4 py-10">
      <div className="w-full max-w-[460px]">
        <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Loading…</p>}>
          <Invoice params={params} />
        </Suspense>
        <p className="mt-6 text-center text-xs text-muted-foreground">Payments settle in USDC on NEAR via NEAR Intents.</p>
      </div>
    </main>
  );
}

async function Invoice({ params }: { params: Promise<{ publicId: string }> }) {
  await connection(); // always live: invoice status changes while the guest is on the page
  const { publicId } = await params;
  const inv = await getPublicInvoice(publicId);
  if (!inv) notFound();
  const open = inv.status === "open" || inv.status === "expired" || inv.status === "pending";
  const mockMode = process.env.NODE_ENV !== "production" && oneClickMode() === "mock";

  return (
    <article className="overflow-hidden rounded-3xl border bg-card shadow-lift" data-testid="pay-invoice">
      {networkId() === "testnet" && (
        <p className="label-caps bg-warning-soft px-4 py-1.5 text-center text-warning" data-testid="pay-test-mode">
          Test mode: no real money moves
        </p>
      )}
      {inv.propertyName && <PropertyCover name={inv.propertyName} className="aspect-[5/2]" />}
      <header className="border-b p-6">
        <p className="text-sm font-semibold" data-testid="pay-business">
          {inv.businessName}
        </p>
        <p className="label-caps mt-4 text-muted-foreground">{KIND[inv.type]}</p>
        <p className="tabular mt-1 font-heading text-[44px] leading-none font-extrabold tracking-tight" data-testid="pay-amount">
          <Money raw={inv.amountRaw} />
        </p>
        <p className="mt-3 font-semibold" data-testid="pay-description">
          {inv.description}
        </p>
        {inv.propertyName && (
          <p className="mt-1 text-sm text-muted-foreground">
            {inv.propertyName}
            {inv.checkIn && inv.checkOut && ` · ${stayRange(inv.checkIn, inv.checkOut)}`}
          </p>
        )}
      </header>
      <div className="p-6">
        {inv.status === "paid" || inv.status === "overpaid" ? (
          <div className="flex items-center gap-2" data-testid="pay-already-paid">
            <StatusPill kind="invoice" status={inv.status} />
            <span className="text-sm text-muted-foreground">This invoice has been paid. Thank you.</span>
          </div>
        ) : inv.status === "waived" ? (
          <div className="flex items-center gap-2" data-testid="pay-waived">
            <StatusPill kind="invoice" status={inv.status} />
            <span className="text-sm text-muted-foreground">{inv.businessName} waived this charge. You don&apos;t owe anything.</span>
          </div>
        ) : !open ? (
          <div className="flex items-center gap-2" data-testid="pay-closed">
            <StatusPill kind="invoice" status={inv.status} />
            <span className="text-sm text-muted-foreground">This invoice is not open for payment.</span>
          </div>
        ) : !inv.vaultAccount ? (
          <p className="text-sm text-muted-foreground" data-testid="pay-not-ready">
            {inv.businessName} hasn&apos;t enabled online payment yet. Please contact them.
          </p>
        ) : (
          <PayFlow publicId={inv.publicId} amountRaw={inv.amountRaw.toString()} businessName={inv.businessName} mockMode={mockMode} />
        )}
      </div>
    </article>
  );
}
