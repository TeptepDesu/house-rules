"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Money } from "@/components/money";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { GUEST_CHAINS } from "@/lib/intents/chains";
import { formatUnits } from "@/lib/intents/format";

type Token = { assetId: string; symbol: string; blockchain: string; decimals: number };
type Quote = { depositAddress: string; depositMemo: string | null; amountIn: string; deadline: string };
type Status = { paymentStatus: string; invoiceStatus: string; amountReceived: string };

const POLL_MS = 3000;
const FINAL = ["verified", "refunded", "expired", "failed"];

export function PayFlow({
  publicId,
  amountRaw,
  businessName,
  mockMode,
}: {
  publicId: string;
  amountRaw: string;
  businessName: string;
  mockMode: boolean;
}) {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [asset, setAsset] = useState("");
  const [refundTo, setRefundTo] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const token = useMemo(() => tokens?.find((t) => t.assetId === asset), [tokens, asset]);

  useEffect(() => {
    fetch(`/api/pay/${publicId}/tokens`)
      .then((r) => r.json())
      .then((j: { tokens?: Token[]; error?: string }) => {
        if (j.tokens) {
          setTokens(j.tokens);
          setAsset(j.tokens[0]?.assetId ?? "");
        } else setError(j.error ?? "Payment options are unavailable right now.");
      })
      .catch(() => setError("Payment options are unavailable right now."));
  }, [publicId]);

  // QR (rendered locally as a PNG data URL) + server-side status polling once we have an address
  useEffect(() => {
    if (!quote) return;
    QRCode.toDataURL(quote.depositAddress, { margin: 1, width: 336 }).then(setQrDataUrl);
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/pay/${publicId}/status?d=${encodeURIComponent(quote.depositAddress)}`).catch(() => null);
      const j = r?.ok ? ((await r.json()) as Status) : null;
      if (j && !stop) setStatus(j);
      if (!stop && !(j && FINAL.includes(j.paymentStatus))) setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [quote, publicId]);

  async function getAddress(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/pay/${publicId}/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ originAsset: asset, refundTo }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) {
      setError((j as { error?: string }).error ?? "Couldn't create a payment address. Try again.");
      return;
    }
    setQuote(j as Quote);
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (status?.invoiceStatus === "paid" || status?.invoiceStatus === "overpaid") {
    return (
      <div className="grid justify-items-center gap-2 py-4 text-center" data-testid="pay-confirmed">
        <span className="flex size-10 items-center justify-center rounded-full bg-success text-primary-foreground">
          <Check aria-hidden className="size-5" />
        </span>
        <p className="text-lg font-semibold">Payment received</p>
        <p className="text-sm text-muted-foreground">
          <Money raw={BigInt(status.amountReceived)} /> reached {businessName}. You can close this page.
        </p>
      </div>
    );
  }

  if (quote && token) {
    const amountIn = formatUnits(quote.amountIn, token.decimals);
    return (
      <div className="grid gap-4" data-testid="pay-deposit">
        <div className="rounded-2xl border bg-muted/40 p-4 text-sm">
          Send exactly{" "}
          <strong className="tabular" data-testid="pay-amount-in">
            {amountIn} {token.symbol}
          </strong>{" "}
          on <strong>{GUEST_CHAINS[token.blockchain] ?? token.blockchain}</strong> to this address. {businessName} receives exactly{" "}
          <Money raw={BigInt(amountRaw)} />.
        </div>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local data URL, nothing to optimize
            <img src={qrDataUrl} alt="QR code of the payment address" width={168} height={168} className="shrink-0 rounded-lg border bg-white p-1" />
          ) : (
            <div className="size-[168px] shrink-0 rounded-lg border bg-muted" aria-hidden />
          )}
          <div className="grid w-full min-w-0 gap-2">
            <p className="text-xs text-muted-foreground">Payment address</p>
            <p className="font-mono text-sm break-all" data-testid="pay-page-deposit-address">
              {quote.depositAddress}
            </p>
            {quote.depositMemo && (
              <p className="text-sm">
                Memo (required): <span className="font-mono">{quote.depositMemo}</span>
              </p>
            )}
            <Button variant="outline" size="sm" className="justify-self-start" data-testid="pay-copy-address" onClick={() => copy(quote.depositAddress)}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy address"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Valid until {new Date(quote.deadline).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. If anything goes wrong, the funds are
              refunded to your address automatically.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t pt-3" role="status" aria-live="polite" data-testid="pay-status">
          <StatusPill kind="payment" status={status?.paymentStatus ?? "awaiting_deposit"} data-testid="pay-status-pill" />
          <span className="text-sm text-muted-foreground">
            {status?.invoiceStatus === "underpaid" ? "Less than the invoice arrived. The host will contact you." : "This page updates on its own."}
          </span>
        </div>
        {mockMode && (
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start border-dashed"
            data-testid="pay-dev-simulate"
            onClick={() =>
              fetch("/api/dev/simulate-deposit", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ depositAddress: quote.depositAddress }),
              })
            }
          >
            Dev only: simulate the guest&apos;s deposit
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={getAddress} className="grid gap-3" data-testid="pay-form">
      <FormField id="pay-asset" label="Pay with">
        {(p) => (
          <NativeSelect value={asset} onChange={(e) => setAsset(e.target.value)} disabled={!tokens} {...p}>
            {!tokens && <option>Loading…</option>}
            {tokens?.map((t) => (
              <option key={t.assetId} value={t.assetId}>
                {t.symbol} on {GUEST_CHAINS[t.blockchain] ?? t.blockchain}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField id="pay-refund" label="Your refund address" hint="On the same chain. Used only if the payment can't complete.">
        {(p) => (
          <Input value={refundTo} onChange={(e) => setRefundTo(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" required {...p} />
        )}
      </FormField>
      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="pay-error">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={busy || !asset || !refundTo.trim()} data-testid="pay-get-address">
        {busy ? "Preparing…" : "Get payment address"}
      </Button>
    </form>
  );
}
