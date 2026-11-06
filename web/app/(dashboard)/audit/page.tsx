import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TxLink } from "@/components/tx-link";
import { describeActivity, describeVaultEvent } from "@/lib/audit/describe";
import { requireUser } from "@/lib/auth/dal";
import { type AuditRow, listAuditFeed } from "@/lib/db/audit";
import { listPayees } from "@/lib/db/people";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log · House Rules" };

const TABS = [
  { show: "all", label: "Everything" },
  { show: "chain", label: "On-chain" },
  { show: "app", label: "In app" },
] as const;
type Show = (typeof TABS)[number]["show"];

export default function AuditPage({ searchParams }: PageProps<"/audit">) {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="What happened to your money. On-chain rows come from your vault's own events; open any of them on the NEAR explorer."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground" data-testid="audit-loading">Loading…</p>}>
        <AuditContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const when = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function AuditContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const show: Show = sp.show === "chain" || sp.show === "app" ? sp.show : "all";
  const [rows, payees] = await Promise.all([listAuditFeed(user.id, show), listPayees(user.id)]);
  const names = new Map(payees.map((p) => [p.nearAccount, p.name]));

  return (
    <div className="grid gap-4">
      <nav aria-label="Filter" className="flex gap-1" data-testid="audit-filter">
        {TABS.map((t) => (
          <Link
            key={t.show}
            href={t.show === "all" ? "/audit" : `/audit?show=${t.show}`}
            aria-current={show === t.show ? "page" : undefined}
            data-testid={`audit-filter-${t.show}`}
            className={cn("rounded-lg px-3 py-1.5 text-sm transition-colors", show === t.show ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-secondary/60")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState data-testid="audit-empty" title="Nothing here yet" body="Payouts, payee approvals and limit changes in your vault will appear here, each with a link to the chain." />
      ) : (
        <ol className="divide-y rounded-2xl border" data-testid="audit-feed">
          {rows.map((r) => (
            <Row key={`${r.kind}-${r.id}`} r={r} names={names} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Row({ r, names }: { r: AuditRow; names: Map<string, string> }) {
  const chain = r.kind === "chain";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" data-testid={chain ? `audit-event-row-${r.txHash}-${r.event}` : `audit-app-row-${r.id}`} data-kind={r.kind}>
      <div className="min-w-0">
        <p className="text-sm">{chain ? describeVaultEvent(r.event, r.data, names) : describeActivity(r.action, r.meta)}</p>
        <p className="text-xs text-muted-foreground">{when(r.at)}</p>
      </div>
      {chain ? (
        r.simulated ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Simulated</span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">On-chain</span>
            <TxLink hash={r.txHash} />
          </span>
        )
      ) : (
        <span className="rounded-full bg-info-soft px-2 py-0.5 text-xs text-info">In app</span>
      )}
    </li>
  );
}
