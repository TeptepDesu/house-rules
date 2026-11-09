import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Money } from "@/components/money";
import { PropertyCover } from "@/components/property-cover";
import { StatusPill } from "@/components/status-pill";
import { TxLink } from "@/components/tx-link";
import { agentMode } from "@/lib/agent/vault-factory";
import { getPayeeStatement } from "@/lib/db/statements";
import { networkId } from "@/lib/near/network";
import { buildStatement } from "@/lib/statement";
import { stayRange } from "@/lib/ui/format";

// A payee's payout statement (owner or cleaner), opened from the link the operator shares.
// Same frame as the guest pay page: no app chrome, one column, readable on a phone.
export const metadata: Metadata = { title: "Payout statement", robots: { index: false, follow: false } };

const ROLE = { owner: "Property owner", cleaner: "Cleaner" } as const;

export default function StatementPage({ params }: PageProps<"/statement/[token]">) {
  return (
    <main className="flex flex-1 justify-center px-4 py-10">
      <div className="w-full max-w-[460px]">
        <Suspense fallback={<p className="text-center text-sm text-muted-foreground" data-testid="statement-loading">Loading…</p>}>
          <Statement params={params} />
        </Suspense>
        <p className="mt-6 text-center text-xs text-muted-foreground">Payouts are made in USDC on NEAR, from the operator&apos;s vault, within its rules.</p>
      </div>
    </main>
  );
}

async function Statement({ params }: { params: Promise<{ token: string }> }) {
  await connection(); // always live: a payout run changes it
  const { token } = await params;
  const view = await getPayeeStatement(token);
  if (!view) notFound();
  const { lines, paidRaw, heldRaw } = buildStatement(view.rows, { rehearsal: agentMode() === "mock" });

  return (
    <article className="overflow-hidden rounded-3xl border bg-card shadow-lift" data-testid="statement-page">
      {networkId() === "testnet" && (
        <p className="label-caps bg-warning-soft px-4 py-1.5 text-center text-warning" data-testid="statement-test-mode">
          Test mode: no real money moves
        </p>
      )}
      <header className="border-b p-6">
        <p className="text-sm font-semibold" data-testid="statement-business">
          {view.businessName}
        </p>
        <p className="label-caps mt-4 text-muted-foreground">Payout statement</p>
        <h1 className="mt-1 font-heading text-[28px] leading-tight font-extrabold tracking-tight" data-testid="statement-payee">
          {view.payee.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ROLE[view.payee.role]} · <span className="font-mono text-xs">{view.payee.nearAccount}</span>
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-success-soft p-3">
            <dt className="label-caps text-success">Paid to you</dt>
            <dd className="tabular mt-1 font-heading text-[30px] leading-none font-extrabold" data-testid="statement-paid-total">
              <Money raw={paidRaw} />
            </dd>
          </div>
          <div className="rounded-2xl bg-muted p-3">
            <dt className="label-caps text-muted-foreground">Held</dt>
            <dd className="tabular mt-1 font-heading text-[30px] leading-none font-extrabold" data-testid="statement-held-total">
              <Money raw={heldRaw} />
            </dd>
          </div>
        </dl>
      </header>

      {lines.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground" data-testid="statement-empty">
          No payouts yet. They&apos;ll show here once {view.businessName} pays out your bookings.
        </p>
      ) : (
        <ul className="divide-y" data-testid="statement-lines">
          {lines.map((l) => (
            <li key={l.id} className="flex gap-3 p-4" data-testid={`statement-line-${l.id}`} data-state={l.state}>
              {l.propertyName && <PropertyCover name={l.propertyName} className="size-12 shrink-0 rounded-xl" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{l.propertyName ?? "Booking"}</p>
                    <p className="text-sm text-muted-foreground">{stayRange(l.checkIn, l.checkOut)}</p>
                  </div>
                  <p className="tabular font-semibold">
                    <Money raw={l.amountRaw} />
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusPill kind="statement" status={l.state} data-testid={`statement-line-status-${l.id}`} />
                  {l.state === "held" && (
                    <span className="text-sm text-muted-foreground" data-testid={`statement-line-reason-${l.id}`}>
                      {l.reasonText}
                    </span>
                  )}
                  {l.txHash && <TxLink hash={l.txHash} data-testid={`statement-line-tx-${l.id}`} />}
                  {l.simulated && <span className="text-xs text-muted-foreground">Simulated (rehearsal)</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
