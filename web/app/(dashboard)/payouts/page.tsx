import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { RunAgent } from "@/components/payouts/run-agent";
import { StatusPill } from "@/components/status-pill";
import { TxLink } from "@/components/tx-link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reasonLabel } from "@/lib/agent/labels";
import { planBookingPayouts } from "@/lib/agent/plan";
import { agentMode } from "@/lib/agent/vault-factory";
import { requireUser } from "@/lib/auth/dal";
import { listRunsWithTxs, loadAgentInputs, unpaidSplits } from "@/lib/db/agent";
import { getVaultAccount } from "@/lib/db/invoices";
import { networkId } from "@/lib/near/network";

export const metadata: Metadata = { title: "Payouts · House Rules" };

const ROLE = { owner: "Owner", cleaner: "Cleaner", manager: "Your fee" } as const;
const when = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function PayoutsPage() {
  return (
    <>
      <PageHeader title="Payouts" description="The agent pays owners and cleaners for reconciled bookings, only within your vault's rules." />
      <Suspense fallback={<p className="text-sm text-muted-foreground" data-testid="payouts-loading">Loading…</p>}>
        <PayoutsContent />
      </Suspense>
    </>
  );
}

async function PayoutsContent() {
  const user = await requireUser();
  const [{ ready, terms }, held, runs, vault] = await Promise.all([loadAgentInputs(user.id), unpaidSplits(user.id), listRunsWithTxs(user.id), getVaultAccount(user.id)]);
  const plans = planBookingPayouts(ready, terms);
  const ok = plans.filter((p) => !p.problem);
  const blocked = plans.filter((p) => p.problem);
  const toPay = ok.reduce((a, p) => a + p.split.owner + p.split.cleaner, 0n);
  const retained = ok.reduce((a, p) => a + p.split.manager, 0n);
  const mode = agentMode();
  const network = networkId();
  const explorerBase = network === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

  return (
    <div className="grid gap-8">
      {mode === "mock" && (
        <p className="rounded-[10px] border border-dashed px-4 py-2 text-sm text-muted-foreground" data-testid="payouts-rehearsal">
          Rehearsal mode: payouts go to a simulated vault on this server. Set AGENT_MODE=live to pay through your real vault.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Ready to pay out" value={<Money raw={toPay} />} context={`${ok.length} booking${ok.length === 1 ? "" : "s"}, owners + cleaners`} data-testid="metric-to-pay" />
        <MetricCard label="Your fees (kept in vault)" value={<Money raw={retained} />} context="Management share of these bookings" data-testid="metric-retained" />
        <MetricCard label="Held back" value={held.length + blocked.length} context="Payouts needing attention" data-testid="metric-held" />
      </div>

      <section aria-labelledby="run-title" className="grid gap-2">
        <h2 id="run-title" className="text-[15px] font-semibold">
          Pay out now
        </h2>
        {!vault ? (
          <p className="text-sm text-muted-foreground" data-testid="payouts-no-vault">
            <Link href="/settings" className="text-primary underline-offset-4 hover:underline">
              Connect your vault
            </Link>{" "}
            to let the agent pay out.
          </p>
        ) : (
          <RunAgent disabled={ok.length === 0} explorerBase={explorerBase} />
        )}
        {vault && ok.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="payouts-nothing">
            Nothing is ready to pay. Bookings become ready once they reconcile.
          </p>
        )}
      </section>

      {(held.length > 0 || blocked.length > 0) && (
        <section aria-labelledby="held-title">
          <h2 id="held-title" className="mb-3 text-[15px] font-semibold">
            Held back
          </h2>
          <ul className="divide-y rounded-[10px] border" data-testid="payouts-held">
            {held.map((h) => (
              <li key={`${h.bookingId}:${h.role}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" data-testid={`held-${h.bookingId}-${h.role}`}>
                <div className="min-w-0">
                  <p className="font-medium">
                    {h.payeeName ?? "Payee"} · {ROLE[h.role]} <span className="font-normal text-muted-foreground">for {h.guestName}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">{reasonLabel(h.reason)}</p>
                </div>
                <Money raw={h.amountRaw} />
              </li>
            ))}
            {blocked.map((b) => (
              <li key={b.bookingId} className="px-4 py-3" data-testid={`held-setup-${b.bookingId}`}>
                <p className="text-sm">{reasonLabel(b.problem)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="history-title">
        <h2 id="history-title" className="mb-3 text-[15px] font-semibold">
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <EmptyState data-testid="payouts-runs-empty" title="No runs yet" body="Each run checks your rules, then pays every ready booking in as few transactions as possible." />
        ) : (
          <div className="overflow-hidden rounded-[10px] border">
            <Table data-testid="payouts-runs-table">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Held</TableHead>
                  <TableHead className="hidden sm:table-cell">Transactions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id} data-testid={`run-row-${r.id}`}>
                    <TableCell className="whitespace-nowrap">
                      {when(r.startedAt)}
                      <span className="block text-xs text-muted-foreground">{r.trigger === "manual" ? "Run by you" : "Scheduled"}</span>
                    </TableCell>
                    <TableCell>
                      <StatusPill kind="run" status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Money raw={r.paidTotalRaw} />
                    </TableCell>
                    <TableCell className="tabular hidden text-right sm:table-cell">{r.rejectedCount}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {r.txs.length === 0 ? (
                        <span className="text-muted-foreground">None</span>
                      ) : (
                        <ul className="flex flex-wrap gap-x-3">
                          {r.txs.map((t) =>
                            !t.txHash ? (
                              <li key={t.id} className="text-xs text-muted-foreground">
                                {reasonLabel(t.rejectionCode)}
                              </li>
                            ) : t.txHash.startsWith("mock-") ? (
                              <li key={t.id} className="text-xs text-muted-foreground">
                                Simulated
                              </li>
                            ) : (
                              <li key={t.id}>
                                <TxLink hash={t.txHash} />
                              </li>
                            ),
                          )}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
