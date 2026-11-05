"use client";

import { useState } from "react";
import { RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type OwnerActionState, useOwnerAction } from "@/components/vault/use-owner-action";

type Props = { payeeId: string; name: string; account: string; cap: string; onVault: boolean; rehearsal: boolean };

/** Change a payee's max per payout, or remove them. Live: signed by the vault owner's wallet. */
export function ManagePayee({ payeeId, name, account, cap, onVault, rehearsal }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const close = () => (setOpen(false), setConfirmRemove(false));
  const capAction = useOwnerAction(close);
  const removeAction = useOwnerAction(close);
  const busy = capAction.pending || removeAction.pending;
  const viaWallet = onVault && !rehearsal;

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o || (capAction.reset(), removeAction.reset(), setConfirmRemove(false)))}>
      <DialogTrigger render={<Button variant="ghost" size="sm" data-testid={`payee-manage-${payeeId}`} />}>
        <Settings2 aria-hidden />
        Manage
      </DialogTrigger>
      <DialogContent data-testid="payee-manage-dialog">
        <DialogHeader>
          <DialogTitle>Manage {name}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{account}</DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            capAction.run({ kind: "cap", payeeId, cap: String(new FormData(e.currentTarget).get("cap") ?? "") });
          }}
        >
          <Label htmlFor={`cap-${payeeId}`}>Max per payout (USD)</Label>
          <div className="flex gap-2">
            <Input id={`cap-${payeeId}`} name="cap" inputMode="decimal" defaultValue={cap} required className="max-w-[160px]" data-testid="payee-cap-input" aria-invalid={capAction.state.phase === "error" || undefined} />
            <Button type="submit" variant="outline" disabled={busy} data-testid="payee-cap-save">
              {capAction.pending ? "Saving…" : "Save limit"}
            </Button>
          </div>
          {viaWallet && <p className="text-xs text-muted-foreground">Your wallet signs this. The vault re-adds {name} with the new limit, so their waiting period starts again.</p>}
          <ActionStatus state={capAction.state} pending={capAction.pending} onRecheck={capAction.recheck} testid="payee-cap" />
        </form>

        <div className="grid gap-2 border-t pt-4">
          <p className="font-medium">Remove from vault</p>
          <p className="text-xs text-muted-foreground">The vault stops paying {name}. Payouts for their properties are held until you choose someone else under Properties. You can add them back later.</p>
          {!confirmRemove ? (
            <Button type="button" variant="outline" className="justify-self-start" disabled={busy} onClick={() => setConfirmRemove(true)} data-testid="payee-remove">
              Remove {name}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmRemove(false)} data-testid="payee-remove-cancel">
                Keep
              </Button>
              <Button type="button" variant="destructive" disabled={busy} onClick={() => removeAction.run({ kind: "remove", payeeId })} data-testid="payee-remove-confirm">
                {removeAction.pending ? "Removing…" : viaWallet ? "Remove (sign in wallet)" : "Yes, remove"}
              </Button>
            </div>
          )}
          <ActionStatus state={removeAction.state} pending={removeAction.pending} onRecheck={removeAction.recheck} testid="payee-remove" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ActionStatus({ state, pending, onRecheck, testid }: { state: OwnerActionState; pending: boolean; onRecheck: () => void; testid: string }) {
  if (state.phase === "info") return <p role="status" className="text-xs text-muted-foreground" data-testid={`${testid}-status`}>{state.text}</p>;
  if (state.phase === "error") return <p role="alert" className="text-xs text-destructive" data-testid={`${testid}-error`}>{state.text}</p>;
  if (state.phase === "signed")
    return (
      <div className="grid justify-items-start gap-1" data-testid={`${testid}-signed`}>
        <p role="status" className="text-xs text-muted-foreground">{state.text}</p>
        <Button type="button" size="sm" variant="outline" onClick={onRecheck} disabled={pending} data-testid={`${testid}-recheck`}>
          <RefreshCw aria-hidden />
          {pending ? "Checking…" : "Check again"}
        </Button>
      </div>
    );
  return null;
}
