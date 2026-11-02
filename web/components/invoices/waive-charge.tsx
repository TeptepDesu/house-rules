"use client";

import { useState, useTransition } from "react";
import { waiveCharge } from "@/app/(dashboard)/invoices/actions";
import { Button } from "@/components/ui/button";

/** "Waive" with an inline confirm: forgiving a charge unblocks the booking's payout. */
export function WaiveCharge({ publicId, amount, testidSuffix = "" }: { publicId: string; amount: string; testidSuffix?: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => (setConfirming(true), setError(null))} data-testid={`invoice-waive-${publicId}${testidSuffix}`}>
        Waive
      </Button>
    );
  }
  return (
    <div className="grid justify-items-end gap-1" data-testid={`invoice-waive-confirm-${publicId}${testidSuffix}`}>
      <p className="text-xs text-muted-foreground">Waive {amount}? The guest won&apos;t owe it.</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirming(false)} data-testid={`invoice-waive-cancel-${publicId}${testidSuffix}`}>
          Keep
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={pending}
          data-testid={`invoice-waive-yes-${publicId}${testidSuffix}`}
          onClick={() =>
            start(async () => {
              const r = await waiveCharge(publicId);
              if (r.ok) setConfirming(false);
              else setError(r.error ?? "Couldn't waive it.");
            })
          }
        >
          {pending ? "Waiving…" : "Waive charge"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="max-w-[240px] text-right text-xs text-destructive" data-testid={`invoice-waive-error-${publicId}${testidSuffix}`}>
          {error}
        </p>
      )}
    </div>
  );
}
