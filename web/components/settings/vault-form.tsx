"use client";

import { useActionState } from "react";
import { saveVaultAccount } from "@/app/(dashboard)/settings/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function VaultForm({ current, example }: { current: string | null; example: string }) {
  const [state, action, pending] = useActionState(saveVaultAccount, undefined);
  return (
    <form action={action} noValidate className="grid gap-3" data-testid="vault-form">
      <FormField id="vault-account" label="Vault account" error={state?.error}>
        {(p) => (
          <Input
            name="vaultAccount"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            placeholder={example}
            defaultValue={state?.value ?? current ?? ""}
            {...p}
          />
        )}
      </FormField>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} data-testid="vault-submit">
          {pending ? "Saving…" : "Save"}
        </Button>
        {state?.ok && (
          <span role="status" className="text-sm text-success" data-testid="vault-saved">
            Saved. Guests can now pay invoices online.
          </span>
        )}
      </div>
    </form>
  );
}
