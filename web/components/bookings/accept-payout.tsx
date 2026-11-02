"use client";

import { useState, useTransition } from "react";
import { acceptPayout } from "@/app/(dashboard)/bookings/actions";
import { Button } from "@/components/ui/button";

/** Resolve a short/over payout by accepting what actually arrived (inline confirm). */
export function AcceptPayout({ bookingId, refName, amountRaw, amount }: { bookingId: string; refName: string; amountRaw: string; amount: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => (setConfirming(true), setError(null))} data-testid={`booking-accept-${refName}`}>
        Accept {amount}
      </Button>
    );
  }
  return (
    <div className="mt-2 grid max-w-[260px] gap-1.5" data-testid={`booking-accept-confirm-${refName}`}>
      <p className="text-xs text-muted-foreground">Treat {amount} as final? Owners and cleaners are then paid from what actually arrived.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirming(false)} data-testid={`booking-accept-cancel-${refName}`}>
          Keep blocked
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          data-testid={`booking-accept-yes-${refName}`}
          onClick={() =>
            start(async () => {
              const r = await acceptPayout(bookingId, amountRaw);
              if (r.ok) setConfirming(false);
              else setError(r.error ?? "Couldn't save that.");
            })
          }
        >
          {pending ? "Saving…" : "Accept as final"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive" data-testid={`booking-accept-error-${refName}`}>
          {error}
        </p>
      )}
    </div>
  );
}
