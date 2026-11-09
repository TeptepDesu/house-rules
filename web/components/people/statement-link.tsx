"use client";

import { useState, useTransition } from "react";
import { Check, FileText } from "lucide-react";
import { shareStatementLink } from "@/app/(dashboard)/people/statement-actions";
import { Button } from "@/components/ui/button";

/**
 * Copies the payee's read-only statement link (what they were paid, what's held and why). Where the
 * clipboard isn't available (plain http, denied permission) it shows the link to copy by hand.
 */
export function StatementLink({ payeeId }: { payeeId: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ copied?: boolean; url?: string; error?: string }>({});
  return (
    <div className="grid max-w-full gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        data-testid={`payee-statement-link-${payeeId}`}
        onClick={() =>
          start(async () => {
            const r = await shareStatementLink(payeeId);
            if (!r.ok) return setState({ error: r.error });
            const url = `${location.origin}${r.path}`;
            let copied = false;
            try {
              await navigator.clipboard.writeText(url);
              copied = true;
            } catch {
              // no clipboard here: the link is shown below instead
            }
            setState({ copied, url });
            if (copied) setTimeout(() => setState((s) => (s.url === url ? {} : s)), 2500);
          })
        }
      >
        {state.copied ? <Check aria-hidden /> : <FileText aria-hidden />}
        {state.copied ? "Link copied" : "Statement link"}
      </Button>
      {state.url && !state.copied && (
        <p className="text-xs text-muted-foreground" data-testid={`payee-statement-url-${payeeId}`}>
          Copy this link: <span className="font-mono break-all select-all">{state.url}</span>
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-xs text-destructive" data-testid={`payee-statement-error-${payeeId}`}>
          {state.error}
        </p>
      )}
    </div>
  );
}
