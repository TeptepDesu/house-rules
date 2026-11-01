"use client";

import { useActionState } from "react";
import { addProperty } from "@/app/(dashboard)/people/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type Option = { id: string; name: string };

export function PropertyForm({ owners, cleaners }: { owners: Option[]; cleaners: Option[] }) {
  const [state, action, pending] = useActionState(addProperty, undefined);
  const fe = state?.fieldErrors ?? {};
  const v = state?.values ?? {};

  return (
    <form action={action} noValidate className="grid gap-3" data-testid="property-form">
      <FormField id="property-name" label="Property name" hint="Must match the listing name in your payout reports" error={fe.name}>
        {(p) => <Input name="name" autoComplete="off" placeholder="Casa Azul" defaultValue={v.name} {...p} />}
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="property-owner" label="Owner" error={fe.ownerPayeeId}>
          {(p) => (
            <NativeSelect name="ownerPayeeId" defaultValue={v.ownerPayeeId ?? ""} key={`o-${v.ownerPayeeId}`} {...p}>
              <option value="">Not set</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField id="property-cleaner" label="Cleaner" error={fe.cleanerPayeeId}>
          {(p) => (
            <NativeSelect name="cleanerPayeeId" defaultValue={v.cleanerPayeeId ?? ""} key={`c-${v.cleanerPayeeId}`} {...p}>
              <option value="">Not set</option>
              {cleaners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="property-cleaning-fee" label="Cleaning fee (USD)" hint="Flat, per stay" error={fe.cleaningFee}>
          {(p) => <Input name="cleaningFee" inputMode="decimal" placeholder="80" className="tabular" defaultValue={v.cleaningFee} {...p} />}
        </FormField>
        <FormField id="property-mgmt-fee" label="Management fee (%)" hint="Of what's left after cleaning" error={fe.mgmtFee}>
          {(p) => <Input name="mgmtFee" inputMode="decimal" placeholder="15" className="tabular" defaultValue={v.mgmtFee} {...p} />}
        </FormField>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive" data-testid="property-form-error">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} data-testid="property-submit">
          {pending ? "Saving…" : "Add property"}
        </Button>
        {state?.ok && (
          <span role="status" className="text-sm text-success" data-testid="property-form-saved">
            Property added.
          </span>
        )}
      </div>
    </form>
  );
}
