import type { Metadata } from "next";
import { ImportFlow } from "@/components/import/import-flow";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Import · House Rules" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import payouts"
        description="Drop the payout report from Airbnb, Booking.com or your PMS. You'll see exactly what will change before anything is saved."
      />
      <ImportFlow />
    </>
  );
}
