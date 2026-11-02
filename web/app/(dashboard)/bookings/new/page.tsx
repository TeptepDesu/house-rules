import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DirectBookingForm } from "@/components/bookings/direct-booking-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { getVaultAccount } from "@/lib/db/invoices";
import { listProperties } from "@/lib/db/people";

export const metadata: Metadata = { title: "New direct booking · House Rules" };

export default function NewDirectBookingPage() {
  return (
    <>
      <PageHeader title="New direct booking" description="A guest who booked with you, not through a channel. They get an invoice they can pay from any chain." />
      <Suspense fallback={<p className="text-sm text-muted-foreground" data-testid="direct-booking-loading">Loading…</p>}>
        <Content />
      </Suspense>
    </>
  );
}

/** Data for the page, loaded per request (default pay-by date = a week from today). */
async function loadPage(userId: string) {
  const [properties, vault] = await Promise.all([listProperties(userId), getVaultAccount(userId)]);
  return { properties, vault, defaultDue: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) };
}

async function Content() {
  const user = await requireUser();
  const { properties, vault, defaultDue } = await loadPage(user.id);
  if (properties.length === 0) {
    return (
      <EmptyState
        data-testid="direct-booking-no-properties"
        title="Add a property first"
        body="A booking needs a property, so its payout can be split between the owner, the cleaner and you."
        action={
          <Link href="/people" className={buttonVariants()}>
            Add properties
          </Link>
        }
      />
    );
  }
  return <DirectBookingForm properties={properties.map((p) => ({ id: p.id, name: p.name }))} defaultDue={defaultDue} canTakePayment={!!vault} />;
}
