"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { confirmApproval, prepareApproval, rehearsalApprove } from "@/app/(dashboard)/people/approve-actions";
import { Button } from "@/components/ui/button";

// "Approve in vault": the operator's own wallet signs vault.add_payee (via NEAR Connect). The server
// prepared the exact call and verifies the signed tx on-chain afterwards. In rehearsal mode there's
// no chain, so it's a labelled stand-in.

export function ApprovePayee({ payeeId, rehearsal }: { payeeId: string; rehearsal: boolean }) {
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const approve = () =>
    start(async () => {
      setMsg(null);
      const prep = await prepareApproval(payeeId);
      if (!prep.ok) return setMsg({ tone: "error", text: prep.error });
      if (prep.mode === "rehearsal") {
        const r = await rehearsalApprove(payeeId);
        if (!r.ok) setMsg({ tone: "error", text: r.error ?? "Couldn't approve." });
        return;
      }
      try {
        const { NearConnector } = await import("@hot-labs/near-connect"); // browser-only, loaded on demand
        const connector = new NearConnector({ network: prep.network });
        const wallet = await connector.wallet().catch(() => connector.connect());
        const [account] = await wallet.getAccounts();
        if (account?.accountId !== prep.owner) {
          return setMsg({ tone: "error", text: `Connect the vault owner's wallet (${prep.owner}) to approve payees.` });
        }
        setMsg({ tone: "info", text: "Confirm in your wallet…" });
        const result = await wallet.signAndSendTransaction({
          receiverId: prep.vault,
          actions: [{ type: "FunctionCall", params: { methodName: "add_payee", args: prep.args, gas: prep.gas, deposit: prep.deposit } }],
        });
        setMsg({ tone: "info", text: "Checking the vault…" });
        const r = await confirmApproval(payeeId, result.transaction.hash, account.accountId);
        setMsg(r.ok ? null : { tone: "error", text: r.error ?? "Couldn't verify the approval." });
      } catch (e) {
        setMsg({ tone: "error", text: e instanceof Error && /reject|cancel/i.test(e.message) ? "You cancelled in your wallet." : "The wallet didn't complete the approval." });
      }
    });

  return (
    <div className="grid justify-items-start gap-1">
      <Button size="sm" variant="outline" onClick={approve} disabled={pending} data-testid={`payee-approve-${payeeId}`}>
        <ShieldCheck aria-hidden />
        {pending ? "Approving…" : rehearsal ? "Approve (rehearsal)" : "Approve in vault"}
      </Button>
      {msg && (
        <p role={msg.tone === "error" ? "alert" : "status"} className={msg.tone === "error" ? "max-w-[240px] text-xs text-destructive" : "text-xs text-muted-foreground"} data-testid={`payee-approve-msg-${payeeId}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
