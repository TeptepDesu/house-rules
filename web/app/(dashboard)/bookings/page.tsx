import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/dal";
import { listBookingsWithRecon } from "@/lib/db/bookings";
import { stayRange } from "@/lib/ui/format";

export const metadata: Metadata = { title: "Bookings · House Rules" };

const CHANNEL = { direct: "Direct", airbnb: "Airbnb", booking_com: "Booking.com", other: "Other" } as const;

export default function BookingsPage() {
  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every stay, checked against what was actually collected. Only ready bookings are paid out."
        action={
          <Link href="/import" className={buttonVariants({ variant: "outline" })} data-testid="bookings-import-link">
            Import payouts
          </Link>
        }
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground" data-testid="bookings-loading">Loading…</p>}>
        <BookingsContent />
      </Suspense>
    </>
  );
}

async function BookingsContent() {
  const user = await requireUser();
  const rows = await listBookingsWithRecon(user.id);
  if (rows.length === 0) {
    return (
      <EmptyState
        data-testid="bookings-empty"
        title="No bookings yet"
        body="Import a payout report to bring in your Airbnb and Booking.com stays. Direct bookings appear when you send an invoice."
        action={
          <Link href="/import" className={buttonVariants()}>
            Import payouts
          </Link>
        }
      />
    );
  }
  const ready = rows.filter((r) => r.recon.settlementStatus === "ready");
  const blocked = rows.filter((r) => r.recon.settlementStatus === "blocked");
  const waiting = rows.filter((r) => r.recon.settlementStatus === "unreconciled");
  const readyTotal = ready.reduce((a, r) => a + r.recon.collected, 0n);
  // blocked first: they need a decision
  const order = { blocked: 0, unreconciled: 1, ready: 2 } as const;
  const sorted = [...rows].sort((a, b) => order[a.recon.settlementStatus] - order[b.recon.settlementStatus]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Ready to pay out" value={<Money raw={readyTotal} />} context={`${ready.length} booking${ready.length === 1 ? "" : "s"}`} data-testid="metric-ready" />
        <MetricCard label="Blocked" value={blocked.length} context="Need a decision before payout" data-testid="metric-blocked" />
        <MetricCard label="Waiting for payment" value={waiting.length} context="Not due or not reported yet" data-testid="metric-waiting" />
      </div>
      <div className="overflow-hidden rounded-[10px] border">
        <Table data-testid="bookings-table">
          <TableHeader>
            <TableRow>
              <TableHead>Guest</TableHead>
              <TableHead className="hidden md:table-cell">Property</TableHead>
              <TableHead className="hidden sm:table-cell">Stay</TableHead>
              <TableHead className="text-right">Collected</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.id} data-testid={`booking-row-${r.channel}-${r.externalRef}`} data-recon={r.recon.result}>
                <TableCell className="align-top">
                  <div className="font-medium">{r.guestName}</div>
                  <div className="text-xs text-muted-foreground">
                    {CHANNEL[r.channel]} · <span className="font-mono">{r.externalRef}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden align-top md:table-cell">{r.propertyName}</TableCell>
                <TableCell className="tabular hidden align-top whitespace-nowrap sm:table-cell">
                  {stayRange(r.checkIn, r.checkOut)}
                </TableCell>
                <TableCell className="text-right align-top">
                  <Money raw={r.recon.collected} />
                </TableCell>
                <TableCell className="align-top">
                  <StatusPill kind="recon" status={r.recon.result} />
                  {r.recon.settlementStatus === "blocked" && (
                    <p className="mt-1 max-w-[260px] text-xs text-muted-foreground" data-testid={`booking-note-${r.externalRef}`}>
                      {r.recon.note}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
