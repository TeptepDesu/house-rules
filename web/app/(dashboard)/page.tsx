import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Check } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { planBookingPayouts } from "@/lib/agent/plan";
import { requireUser } from "@/lib/auth/dal";
import { listRunsWithTxs, loadAgentInputs, unpaidSplits } from "@/lib/db/agent";
import { listBookingsWithRecon } from "@/lib/db/bookings";
import { listInvoices } from "@/lib/db/invoices";
import { setupCounts } from "@/lib/db/people";
import { attentionItems, overviewMetrics } from "@/lib/overview";
import { cn } from "@/lib/utils";

const when = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="Collected, reconciled, and paid out within your rules." />
      <Suspense fallback={<p className="text-sm text-muted-foreground" data-testid="overview-loading">Loading…</p>}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  const user = await requireUser();
  const [counts, bookings, invoices, held, runs, { ready, terms }] = await Promise.all([
    setupCounts(user.id),
    listBookingsWithRecon(user.id),
    listInvoices(user.id),
    unpaidSplits(user.id),
    listRunsWithTxs(user.id, 5),
    loadAgentInputs(user.id),
  ]);
  // bookings the vault's rules held back count under "Needs attention", not as ready money
  const heldIds = new Set(held.map((h) => h.bookingId));
  const plans = planBookingPayouts(ready, terms).filter((p) => !p.problem && !heldIds.has(p.bookingId));
  const input = {
    bookings: bookings.map((b) => ({
      id: b.id,
      guestName: b.guestName,
      propertyName: b.propertyName,
      settlementStatus: b.settlementStatus === "settled" ? ("settled" as const) : b.recon.settlementStatus,
      collected: b.recon.collected,
      penaltiesCollected: b.recon.penaltiesCollected,
      note: b.recon.note,
    })),
    invoices,
    held,
    runs,
    readyToPay: plans.reduce((a, p) => a + p.split.owner + p.split.cleaner, 0n),
    readyCount: plans.length,
    today: new Date().toISOString().slice(0, 10),
  };
  const m = overviewMetrics(input);
  const items = attentionItems(input);
  const setupDone = counts.payees > 0 && counts.activePayees > 0 && counts.properties > 0;

  return (
    <div className="grid gap-8">
      {!setupDone && <SetupChecklist counts={counts} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="overview-metrics">
        <MetricCard label="Collected" value={<Money raw={m.collected} />} context={plural(m.collectedBookings, "booking")} data-testid="overview-metric-collected" />
        <MetricCard label="Ready to pay out" value={<Money raw={m.readyToPay} />} context={m.readyCount ? `${plural(m.readyCount, "booking")}, owners + cleaners` : "Nothing waiting"} data-testid="overview-metric-ready" />
        <MetricCard label="Paid out" value={<Money raw={m.paidOut} />} context={`in ${plural(m.paidRuns, "run")}`} data-testid="overview-metric-paid" />
        <MetricCard label="Needs attention" value={m.attention} context={m.attention ? "Blocked, held back or overdue" : "Nothing right now"} data-testid="overview-metric-attention" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <section aria-labelledby="attention-title" className="min-w-0">
          <h2 id="attention-title" className="mb-3 text-[15px] font-semibold">
            Needs attention
          </h2>
          {items.length === 0 ? (
            <EmptyState
              data-testid="overview-attention-empty"
              title="Nothing needs you"
              body="Blocked bookings, payouts the vault's rules held back and overdue invoices show up here."
            />
          ) : (
            <ul className="divide-y rounded-[10px] border" data-testid="overview-attention">
              {items.map((it) => (
                <li key={it.key} data-testid={`overview-attention-${it.key}`}>
                  <Link href={it.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{it.title}</span>
                      <span className="block text-sm text-muted-foreground">{it.detail}</span>
                    </span>
                    <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
              {m.attention > items.length && (
                <li className="px-4 py-2 text-xs text-muted-foreground" data-testid="overview-attention-more">
                  {plural(m.attention - items.length, "more item")} on Bookings, Payouts and Invoices
                </li>
              )}
            </ul>
          )}
        </section>

        <section aria-labelledby="runs-title" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="runs-title" className="text-[15px] font-semibold">
              Recent payout runs
            </h2>
            <Link href="/payouts" className="text-sm text-primary underline-offset-4 hover:underline" data-testid="overview-runs-all">
              Payouts
            </Link>
          </div>
          {runs.length === 0 ? (
            <EmptyState data-testid="overview-runs-empty" title="No runs yet" body="Run the agent from Payouts once bookings are ready." />
          ) : (
            <ul className="divide-y rounded-[10px] border" data-testid="overview-runs">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`overview-run-${r.id}`}>
                  <span className="min-w-0">
                    <span className="block text-sm">{when(r.startedAt)}</span>
                    <StatusPill kind="run" status={r.status} />
                  </span>
                  <span className="text-right">
                    <Money raw={r.paidTotalRaw} />
                    {r.rejectedCount > 0 && <span className="block text-xs text-muted-foreground">{r.rejectedCount} held back</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SetupChecklist({ counts: c }: { counts: Awaited<ReturnType<typeof setupCounts>> }) {
  const steps = [
    { id: "payees", done: c.payees > 0, title: "Add the people you pay", body: "Owners and cleaners, each with a maximum per payout.", href: "/people", cta: "Add payees" },
    {
      id: "sign",
      done: c.activePayees > 0,
      title: "Approve payees in your vault",
      body: "You sign once with your wallet; new payees then wait out the safety delay before they can be paid.",
      href: "/people",
      cta: "Review payees",
    },
    { id: "properties", done: c.properties > 0, title: "Add your properties", body: "Cleaning fee and management % decide each payout split.", href: "/people", cta: "Add properties" },
  ];
  const next = steps.find((s) => !s.done);

  return (
    <section aria-labelledby="setup-title" className="max-w-2xl rounded-[10px] border bg-card" data-testid="setup-checklist">
      <div className="border-b px-4 py-3">
        <h2 id="setup-title" className="text-[15px] font-semibold">
          {next ? "Get set up" : "You're set up"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {steps.filter((s) => s.done).length} of {steps.length} done
        </p>
      </div>
      <ol>
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0" data-testid={`setup-step-${s.id}`} data-done={s.done}>
            <span
              aria-hidden
              className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", s.done && "border-success bg-success text-primary-foreground")}
            >
              {s.done && <Check className="size-3" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium", s.done && "text-muted-foreground line-through decoration-1")}>{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </div>
            {next?.id === s.id && (
              <Link href={s.href} className={buttonVariants({ size: "sm" })} data-testid={`setup-step-${s.id}-cta`}>
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
