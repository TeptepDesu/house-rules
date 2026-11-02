"use client";

import { useState } from "react";
import { ArrowDownToLine, SlidersHorizontal } from "lucide-react";
import { ActionStatus } from "@/components/people/manage-payee";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOwnerAction } from "@/components/vault/use-owner-action";

type Props = { dailyLimit: string; delayHours: string; balance: string; owner: string };

/** The operator's own controls over the vault. Each one is signed by the owner's wallet. */
export function VaultControls({ dailyLimit, delayHours, balance, owner }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <LimitsDialog dailyLimit={dailyLimit} delayHours={delayHours} />
      <WithdrawDialog balance={balance} owner={owner} />
    </div>
  );
}

function LimitsDialog({ dailyLimit, delayHours }: { dailyLimit: string; delayHours: string }) {
  const [open, setOpen] = useState(false);
  const a = useOwnerAction(() => setOpen(false));
  const err = (f: string) => (a.state.phase === "error" && a.state.field === f ? a.state.text : null);
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o || a.reset())}>
      <DialogTrigger render={<Button variant="outline" size="sm" data-testid="vault-limits-open" />}>
        <SlidersHorizontal aria-hidden />
        Change limits
      </DialogTrigger>
      <DialogContent data-testid="vault-limits-dialog">
        <DialogHeader>
          <DialogTitle>Change your vault&apos;s limits</DialogTitle>
          <DialogDescription>Your wallet signs this. The agent can never change these.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            a.run({ kind: "limits", daily: String(f.get("daily") ?? ""), delayHours: String(f.get("delayHours") ?? "") });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="limits-daily">Most the vault pays out per day (USD)</Label>
            <Input id="limits-daily" name="daily" inputMode="decimal" defaultValue={dailyLimit} required data-testid="vault-limits-daily" aria-invalid={!!err("daily") || undefined} />
            {err("daily") && <p className="text-xs text-destructive" data-testid="vault-limits-daily-error">{err("daily")}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="limits-delay">New payees wait (hours)</Label>
            <Input id="limits-delay" name="delayHours" inputMode="numeric" defaultValue={delayHours} required data-testid="vault-limits-delay" aria-invalid={!!err("delay") || undefined} />
            {err("delay") && <p className="text-xs text-destructive" data-testid="vault-limits-delay-error">{err("delay")}</p>}
          </div>
          <Button type="submit" className="justify-self-start" disabled={a.pending} data-testid="vault-limits-save">
            {a.pending ? "Working…" : "Save (sign in wallet)"}
          </Button>
          {a.state.phase !== "error" || !a.state.field ? <ActionStatus state={a.state} pending={a.pending} onRecheck={a.recheck} testid="vault-limits" /> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawDialog({ balance, owner }: { balance: string; owner: string }) {
  const [open, setOpen] = useState(false);
  const a = useOwnerAction(() => setOpen(false));
  const fieldErr = a.state.phase === "error" && a.state.field === "amount" ? a.state.text : null;
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o || a.reset())}>
      <DialogTrigger render={<Button variant="outline" size="sm" data-testid="vault-withdraw-open" />}>
        <ArrowDownToLine aria-hidden />
        Withdraw
      </DialogTrigger>
      <DialogContent data-testid="vault-withdraw-dialog">
        <DialogHeader>
          <DialogTitle>Withdraw to your wallet</DialogTitle>
          <DialogDescription>
            The vault holds {balance}. Withdrawals only go to your own wallet, <span className="font-mono">{owner}</span>.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            a.run({ kind: "withdraw", amount: String(new FormData(e.currentTarget).get("amount") ?? "") });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="withdraw-amount">Amount (USD)</Label>
            <Input id="withdraw-amount" name="amount" inputMode="decimal" required className="max-w-[200px]" data-testid="vault-withdraw-amount" aria-invalid={!!fieldErr || undefined} />
            {fieldErr && <p className="text-xs text-destructive" data-testid="vault-withdraw-amount-error">{fieldErr}</p>}
          </div>
          <Button type="submit" className="justify-self-start" disabled={a.pending} data-testid="vault-withdraw-submit">
            {a.pending ? "Working…" : "Withdraw (sign in wallet)"}
          </Button>
          {!fieldErr && <ActionStatus state={a.state} pending={a.pending} onRecheck={a.recheck} testid="vault-withdraw" />}
        </form>
      </DialogContent>
    </Dialog>
  );
}
