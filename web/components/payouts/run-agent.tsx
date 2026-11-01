"use client";

import { useActionState } from "react";
import { ArrowUpRight, Play } from "lucide-react";
import { runAgentNow } from "@/app/(dashboard)/payouts/actions";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { reasonLabel } from "@/lib/agent/labels";

/** "Run agent now": the primary trigger (plan §6E). Shows what actually happened on-chain. */
export function RunAgent({ disabled, explorerBase }: { disabled: boolean; explorerBase: string }) {
  const [state, action, pending] = useActionState(runAgentNow, undefined);

  return (
    <div className="grid gap-3">
      <form action={action}>
        <Button type="submit" size="lg" disabled={disabled || pending} data-testid="agent-run-button">
          <Play aria-hidden />
          {pending ? "Paying out…" : "Run agent now"}
        </Button>
      </form>
      {pending && (
        <p role="status" className="text-sm text-muted-foreground" data-testid="agent-run-pending">
          Checking your rules, then paying through the vault…
        </p>
      )}
      {!pending && state && !state.ok && (
        <p role="alert" className="text-sm text-destructive" data-testid="agent-run-error">
          {state.error}
        </p>
      )}
      {!pending && state?.ok && (
        <div role="status" className="rounded-[10px] border bg-card p-3 text-sm" data-testid="agent-run-result" data-status={state.status}>
          {state.payouts > 0 ? (
            <p>
              Paid <Money raw={BigInt(state.paid)} className="font-semibold" /> to {state.payouts} payee{state.payouts === 1 ? "" : "s"} in {state.txs.length}{" "}
              transaction{state.txs.length === 1 ? "" : "s"}.
            </p>
          ) : (
            <p>Nothing was paid in this run.</p>
          )}
          {state.held > 0 && (
            <p className="mt-1 text-muted-foreground">
              {state.held} payout{state.held === 1 ? "" : "s"} held back. See the reasons below.
            </p>
          )}
          {state.stopped && <p className="mt-1 text-destructive">Run stopped: {reasonLabel(state.stopped)}.</p>}
          {state.txs.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-3">
              {state.txs.map((h) =>
                h.startsWith("mock-") ? (
                  <li key={h} className="text-xs text-muted-foreground">
                    Simulated transaction
                  </li>
                ) : (
                  <li key={h}>
                    <a href={`${explorerBase}/txns/${h}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline">
                      View on-chain <ArrowUpRight aria-hidden className="size-3.5" />
                    </a>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
