"use client";

import { useRef, useState, useTransition } from "react";
import { type OwnerActionInput, applyDirect, confirmOwnerAction, prepareOwnerAction } from "@/app/(dashboard)/owner-actions";

export type OwnerActionState =
  | { phase: "idle" }
  | { phase: "info"; text: string }
  | { phase: "error"; text: string; field?: string }
  | { phase: "signed"; text: string; txHash: string } // signed, chain hasn't caught up: "Check again"
  | { phase: "done" };

/**
 * Prepare on the server → sign with the vault owner's wallet (NEAR Connect) → the server confirms
 * from the chain. Rehearsal / not-yet-on-chain changes apply directly. "Check again" re-reads the
 * vault without asking the wallet to sign twice.
 */
export function useOwnerAction(onDone?: () => void) {
  const [state, setState] = useState<OwnerActionState>({ phase: "idle" });
  const [pending, start] = useTransition();
  const last = useRef<OwnerActionInput | null>(null); // "Check again" re-confirms exactly what was signed

  const confirm = (input: OwnerActionInput, txHash?: string) =>
    start(async () => {
      setState({ phase: "info", text: "Checking your vault…" });
      const r = await confirmOwnerAction(input, txHash);
      if (r.ok) {
        setState({ phase: "done" });
        onDone?.();
      } else if (r.retry && txHash) setState({ phase: "signed", text: r.error, txHash });
      else setState({ phase: "error", text: r.error });
    });

  const run = (input: OwnerActionInput) =>
    start(async () => {
      last.current = input;
      setState({ phase: "idle" });
      const prep = await prepareOwnerAction(input);
      if (!prep.ok) return setState({ phase: "error", text: prep.error, field: prep.field });
      if (prep.mode === "direct") {
        const r = await applyDirect(input);
        if (!r.ok) return setState({ phase: "error", text: r.error });
        setState({ phase: "done" });
        return onDone?.();
      }
      let txHash: string;
      try {
        const { NearConnector } = await import("@hot-labs/near-connect"); // browser-only, loaded on demand
        const connector = new NearConnector({ network: prep.network });
        let wallet = await connector.wallet().catch(() => connector.connect());
        let [account] = await wallet.getAccounts();
        if (account?.accountId !== prep.owner) {
          await connector.disconnect(wallet).catch(() => undefined);
          wallet = await connector.connect();
          [account] = await wallet.getAccounts();
        }
        if (account?.accountId !== prep.owner) return setState({ phase: "error", text: `Connect the vault owner's wallet (${prep.owner}).` });
        setState({ phase: "info", text: "Confirm in your wallet…" });
        const result = await wallet.signAndSendTransaction({
          receiverId: prep.vault,
          actions: prep.calls.map((c) => ({ type: "FunctionCall" as const, params: { methodName: c.methodName, args: c.args, gas: c.gas, deposit: c.deposit } })),
        });
        txHash = result.transaction.hash;
      } catch (e) {
        return setState({ phase: "error", text: e instanceof Error && /reject|cancel/i.test(e.message) ? "You cancelled in your wallet." : "The wallet didn't complete it." });
      }
      setState({ phase: "info", text: "Checking your vault…" });
      const r = await confirmOwnerAction(input, txHash);
      if (r.ok) {
        setState({ phase: "done" });
        onDone?.();
      } else if (r.retry) setState({ phase: "signed", text: r.error, txHash });
      else setState({ phase: "error", text: r.error });
    });

  const recheck = () => {
    if (state.phase === "signed" && last.current) confirm(last.current, state.txHash);
  };
  return { state, pending, run, recheck, reset: () => setState({ phase: "idle" }) };
}
