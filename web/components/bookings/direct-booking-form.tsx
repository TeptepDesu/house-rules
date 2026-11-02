"use client";

import Link from "next/link";
import { useActionState } from "react";
import { newDirectBooking } from "@/app/(dashboard)/bookings/actions";
import { FormField } from "@/components/form-field";
import { CopyPayLink } from "@/components/invoices/copy-pay-link";
import { Money } from "@/components/money";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type Property = { id: string; name: string };

/** New direct booking → the booking and the invoice the guest pays (from any chain). */
export function DirectBookingForm({ properties, defaultDue, canTakePayment }: { properties: Property[]; defaultDue: string; canTakePayment: boolean }) {
  const [state, action, pending] = useActionState(newDirectBooking, undefined);

  if (state?.ok) {
    return (
      <div className="grid max-w-xl gap-3 rounded-[10px] border bg-card p-5" data-testid="direct-booking-created">
        <p className="font-medium">
          Booking <span className="font-mono">{state.externalRef}</span> created for {state.guestName}
        </p>
        <p className="text-sm text-muted-foreground">
          Send {state.guestName} the pay link for <Money raw={BigInt(state.total)} />. They can pay from any chain; the vault receives exact USDC, and the booking is ready to
          pay out once it&apos;s paid.
          {!canTakePayment && " Connect your vault in Settings first so the link can take payment."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <CopyPayLink publicId={state.publicId} testid="direct-booking-copy-link" />
          <Link href={`/pay/${state.publicId}`} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="direct-booking-open">
            Open pay page
          </Link>
          <Link href="/bookings" className={buttonVariants({ size: "sm" })} data-testid="direct-booking-done">
            Back to bookings
          </Link>
        </div>
      </div>
    );
  }

  const fe = state?.fieldErrors ?? {};
  const v = state?.values ?? {};
  return (
    <form action={action} noValidate className="grid max-w-xl gap-3 rounded-[10px] border bg-card p-5" data-testid="direct-booking-form">
      <FormField id="direct-guest" label="Guest name" error={fe.guestName}>
        {(p) => <Input name="guestName" autoComplete="off" defaultValue={v.guestName} {...p} />}
      </FormField>
      <FormField id="direct-property" label="Property" error={fe.propertyId}>
        {(p) => (
          <NativeSelect name="propertyId" defaultValue={v.propertyId ?? ""} key={`p-${v.propertyId}`} {...p}>
            <option value="" disabled>
              Choose a property
            </option>
            {properties.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="direct-checkin" label="Check-in" error={fe.checkIn}>
          {(p) => <Input name="checkIn" type="date" defaultValue={v.checkIn} {...p} />}
        </FormField>
        <FormField id="direct-checkout" label="Check-out" error={fe.checkOut}>
          {(p) => <Input name="checkOut" type="date" defaultValue={v.checkOut} {...p} />}
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="direct-total" label="Total for the stay (USD)" error={fe.total}>
          {(p) => <Input name="total" inputMode="decimal" placeholder="600" className="tabular" defaultValue={v.total} {...p} />}
        </FormField>
        <FormField id="direct-due" label="Guest pays by" error={fe.dueDate}>
          {(p) => <Input name="dueDate" type="date" defaultValue={v.dueDate || defaultDue} {...p} />}
        </FormField>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive" data-testid="direct-booking-error">
          {state.error}
        </p>
      )}
      <Button type="submit" className="justify-self-start" disabled={pending} data-testid="direct-booking-submit">
        {pending ? "Creating…" : "Create booking and invoice"}
      </Button>
    </form>
  );
}
