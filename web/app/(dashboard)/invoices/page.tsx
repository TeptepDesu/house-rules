import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { ChargeForm } from "@/components/invoices/charge-form";
import { CopyPayLink } from "@/components/invoices/copy-pay-link";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/dal";
import { listBookingOptions } from "@/lib/db/bookings";
import { getVaultAccount, listInvoices } from "@/lib/db/invoices";

export const metadata: Metadata = { title: "Invoices · House Rules" };

export default function InvoicesPage() {
  return (
    <>
      <PageHeader
        title="Invoices"
        description="Charge guests for damage, late checkout or extra nights. They pay from any chain; exact USDC lands in your vault."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground" data-testid="invoices-loading">Loading…</p>}>
        <InvoicesContent />
      </Suspense>
    </>
  );
}

/** Data for the page, loaded per request (default due date = a week from today). */
async function loadInvoicesPage(userId: string) {
  const [invoices, bookings, vault] = await Promise.all([listInvoices(userId), listBookingOptions(userId), getVaultAccount(userId)]);
  return { invoices, bookings, vault, due: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) };
}

async function InvoicesContent() {
  const user = await requireUser();
  const { invoices, bookings, vault, due } = await loadInvoicesPage(user.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section aria-labelledby="invoices-title" className="min-w-0">
        <h2 id="invoices-title" className="sr-only">
          All invoices
        </h2>
        {!vault && (
          <p className="mb-4 rounded-[10px] border bg-warning-soft px-4 py-3 text-sm text-warning" data-testid="invoices-no-vault">
            Guests can&apos;t pay online until you connect your vault.{" "}
            <Link href="/settings" className="font-medium underline underline-offset-4">
              Connect it in Settings
            </Link>
            .
          </p>
        )}
        {invoices.length === 0 ? (
          <EmptyState data-testid="invoices-empty" title="No invoices yet" body="Create one to charge a guest. They'll get a link to pay from any wallet, on any chain." />
        ) : (
          <div className="overflow-hidden rounded-[10px] border">
            <Table data-testid="invoices-table">
              <TableHeader>
                <TableRow>
                  <TableHead>For</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    <span className="sr-only">Pay link</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id} data-testid={`invoice-row-${i.publicId}`}>
                    <TableCell className="align-top">
                      <div className="font-medium">{i.description || "Invoice"}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.guestName ?? "No booking"}
                        {i.propertyName && ` · ${i.propertyName}`}
                      </div>
                      {/* small screens: the link actions live here (the column is hidden) */}
                      <div className="mt-2 flex items-center gap-3 sm:hidden">
                        <CopyPayLink publicId={i.publicId} testid={`copy-pay-link-mobile-${i.publicId}`} />
                        <Link href={`/pay/${i.publicId}`} target="_blank" className="text-sm text-primary underline-offset-4 hover:underline">
                          Open
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <Money raw={i.amountRaw} />
                    </TableCell>
                    <TableCell className="align-top">
                      <StatusPill kind="invoice" status={i.status} data-testid={`invoice-row-status-${i.publicId}`} />
                    </TableCell>
                    <TableCell className="hidden text-right align-top sm:table-cell">
                      <div className="flex justify-end gap-2">
                        <CopyPayLink publicId={i.publicId} />
                        <Link href={`/pay/${i.publicId}`} target="_blank" className="self-center text-sm text-primary underline-offset-4 hover:underline" data-testid={`invoice-open-${i.publicId}`}>
                          Open
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <section aria-labelledby="charge-title" className="h-fit rounded-[10px] border bg-card p-4">
        <h2 id="charge-title" className="mb-3 text-sm font-semibold">
          Charge a guest
        </h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Charges belong to a stay.{" "}
            <Link href="/import" className="text-primary underline-offset-4 hover:underline">
              Import bookings
            </Link>{" "}
            first.
          </p>
        ) : (
          <ChargeForm bookings={bookings} defaultDue={due} />
        )}
      </section>
    </div>
  );
}
