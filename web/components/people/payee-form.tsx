"use client";

import { useActionState } from "react";
import { addPayee } from "@/app/(dashboard)/people/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export function PayeeForm({ network }: { network: "testnet" | "mainnet" }) {
  const [state, action, pending] = useActionState(addPayee, undefined);
  const fe = state?.fieldErrors ?? {};
  const v = state?.values ?? {};
  const example = network === "mainnet" ? "maria.near" : "maria.testnet";

  return (
    <form action={action} noValidate className="grid gap-3" data-testid="payee-form">
      <FormField id="payee-name" label="Name" error={fe.name}>
        {(p) => <Input name="name" autoComplete="off" placeholder="Maria Santos" defaultValue={v.name} {...p} />}
      </FormField>
      <FormField id="payee-role" label="Role" error={fe.role}>
        {(p) => (
          <NativeSelect name="role" defaultValue={v.role || "cleaner"} key={v.role} {...p}>
            <option value="owner">Property owner</option>
            <option value="cleaner">Cleaner</option>
          </NativeSelect>
        )}
      </FormField>
      <FormField id="payee-account" label="NEAR account" hint="Where their USDC is paid" error={fe.nearAccount}>
        {(p) => <Input name="nearAccount" autoComplete="off" spellCheck={false} placeholder={example} className="font-mono" defaultValue={v.nearAccount} {...p} />}
      </FormField>
      <FormField id="payee-cap" label="Max per payout (USD)" hint="The vault refuses any single payout above this" error={fe.cap}>
        {(p) => <Input name="cap" inputMode="decimal" placeholder="800" className="tabular" defaultValue={v.cap} {...p} />}
      </FormField>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive" data-testid="payee-form-error">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} data-testid="payee-submit">
          {pending ? "Saving…" : "Add payee"}
        </Button>
        {state?.ok && (
          <span role="status" className="text-sm text-success" data-testid="payee-form-saved">
            Added. Sign with your wallet to let the vault pay them.
          </span>
        )}
      </div>
    </form>
  );
}
