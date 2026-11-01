"use client";

import { useActionState } from "react";
import { createCharge } from "@/app/(dashboard)/invoices/actions";
import { CopyPayLink } from "@/components/invoices/copy-pay-link";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { stayRange } from "@/lib/ui/format";

type Booking = { id: string; guestName: string; externalRef: string; propertyName: string; checkIn: string; checkOut: string };

export function ChargeForm({ bookings, defaultDue }: { bookings: Booking[]; defaultDue: string }) {
  const [state, action, pending] = useActionState(createCharge, undefined);
  const fe = state?.fieldErrors ?? {};
  const v = state?.values ?? {};

  return (
    <form action={action} noValidate className="grid gap-3" data-testid="charge-form">
      <FormField id="charge-booking" label="Booking" error={fe.bookingId}>
        {(p) => (
          <NativeSelect name="bookingId" defaultValue={v.bookingId ?? ""} key={`b-${v.bookingId}`} {...p}>
            <option value="" disabled>
              Choose a stay
            </option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.guestName} · {b.propertyName} · {stayRange(b.checkIn, b.checkOut)}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField id="charge-type" label="For" error={fe.type}>
        {(p) => (
          <NativeSelect name="type" defaultValue={v.type || "penalty"} key={`t-${v.type}`} {...p}>
            <option value="penalty">Damage or fee</option>
            <option value="extension">Stay extension</option>
          </NativeSelect>
        )}
      </FormField>
      <FormField id="charge-description" label="Description (the guest sees this)" error={fe.description}>
        {(p) => <Input name="description" placeholder="Damage: broken lamp" defaultValue={v.description} {...p} />}
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="charge-amount" label="Amount (USD)" error={fe.amount}>
          {(p) => <Input name="amount" inputMode="decimal" placeholder="200" className="tabular" defaultValue={v.amount} {...p} />}
        </FormField>
        <FormField id="charge-due" label="Due" error={fe.dueDate}>
          {(p) => <Input name="dueDate" type="date" defaultValue={v.dueDate || defaultDue} {...p} />}
        </FormField>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="operatorRevenue"
          defaultChecked={v.operatorRevenue === "on"}
          className="mt-0.5 size-4 accent-[var(--primary)]"
          data-testid="charge-operator-revenue"
        />
        <span>
          Keep this as my fee
          <span className="block text-xs text-muted-foreground">Otherwise it goes to the property owner, e.g. damage repairs.</span>
        </span>
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive" data-testid="charge-form-error">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || bookings.length === 0} data-testid="charge-submit">
          {pending ? "Creating…" : "Create invoice"}
        </Button>
        {state?.ok && state.publicId && (
          <span role="status" className="flex items-center gap-2 text-sm text-success" data-testid="charge-form-saved">
            Invoice created. <CopyPayLink publicId={state.publicId} />
          </span>
        )}
      </div>
    </form>
  );
}
