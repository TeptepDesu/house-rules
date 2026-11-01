"use client";

import { useState, useTransition } from "react";
import { Check, Wallet } from "lucide-react";
import { finishWalletLink, startWalletLink } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";

/** Link the operator's NEAR wallet by signing a one-time message (NEP-413) via NEAR Connect. */
export function WalletLink({ linked }: { linked: string | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const link = () =>
    start(async () => {
      setMsg(null);
      try {
        const c = await startWalletLink();
        const { NearConnector } = await import("@hot-labs/near-connect");
        const connector = new NearConnector({ network: c.network });
        // always let the operator pick the account to link
        await connector.disconnect().catch(() => undefined);
        const wallet = await connector.connect();
        const signed = await wallet.signMessage({ message: c.message, recipient: c.recipient, nonce: new Uint8Array(Buffer.from(c.nonce, "base64")) });
        const r = await finishWalletLink({ accountId: signed.accountId, publicKey: signed.publicKey, signature: signed.signature });
        if (!r.ok) setMsg(r.error ?? "Couldn't link that wallet.");
      } catch (e) {
        setMsg(e instanceof Error && /reject|cancel/i.test(e.message) ? "You cancelled in your wallet." : "The wallet didn't complete the request.");
      }
    });

  return (
    <div className="grid gap-2" data-testid="wallet-link">
      {linked ? (
        <p className="flex items-center gap-2 text-sm" data-testid="wallet-linked">
          <Check aria-hidden className="size-4 text-success" />
          Linked to <span className="font-mono">{linked}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Not linked yet.</p>
      )}
      <Button variant="outline" size="sm" className="justify-self-start" onClick={link} disabled={pending} data-testid="wallet-link-button">
        <Wallet aria-hidden />
        {pending ? "Waiting for your wallet…" : linked ? "Link a different wallet" : "Link your NEAR wallet"}
      </Button>
      {msg && (
        <p role="alert" className="text-xs text-destructive" data-testid="wallet-link-error">
          {msg}
        </p>
      )}
    </div>
  );
}
