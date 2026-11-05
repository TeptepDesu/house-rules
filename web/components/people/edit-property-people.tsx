"use client";

import { useState, useTransition } from "react";
import { updatePropertyPeople } from "@/app/(dashboard)/people/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";

type Option = { id: string; name: string };
type Props = { propertyId: string; name: string; ownerId: string | null; cleanerId: string | null; owners: Option[]; cleaners: Option[] };

/** Who a property pays. Someone removed from the vault isn't an option, so their role reads "Not set". */
export function EditPropertyPeople({ propertyId, name, ownerId, cleanerId, owners, cleaners }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const selected = (list: Option[], id: string | null) => (list.some((o) => o.id === id) ? id! : "");

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setError(null))}>
      <DialogTrigger render={<Button variant="outline" size="sm" data-testid={`property-edit-${propertyId}`} />}>Change people</DialogTrigger>
      <DialogContent data-testid="property-edit-dialog">
        <DialogHeader>
          <DialogTitle>Who {name} pays</DialogTitle>
          <DialogDescription>Applies to every payout from the next run on. Payees must be active in the vault before they can be paid.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await updatePropertyPeople(f);
              if (r.ok) setOpen(false);
              else setError(r.error ?? "Couldn't save that. Try again.");
            });
          }}
        >
          <input type="hidden" name="propertyId" value={propertyId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id={`edit-owner-${propertyId}`} label="Owner">
              {(p) => (
                <NativeSelect name="ownerPayeeId" defaultValue={selected(owners, ownerId)} {...p} data-testid="property-edit-owner">
                  <option value="">Not set</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField id={`edit-cleaner-${propertyId}`} label="Cleaner">
              {(p) => (
                <NativeSelect name="cleanerPayeeId" defaultValue={selected(cleaners, cleanerId)} {...p} data-testid="property-edit-cleaner">
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
          {error && (
            <p role="alert" className="text-sm text-destructive" data-testid="property-edit-error">
              {error}
            </p>
          )}
          <Button type="submit" className="justify-self-start" disabled={pending} data-testid="property-edit-save">
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
