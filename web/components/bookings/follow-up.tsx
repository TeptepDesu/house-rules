"use client";

import { useState, useTransition } from "react";
import { Check, Copy, MessageSquare, Sparkles } from "lucide-react";
import { type FollowUp as FollowUpResult, draftFollowUpFor, polishFollowUp } from "@/app/(dashboard)/bookings/follow-up-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PAY_LINK } from "@/lib/triage/pay-link";

/** Draft a follow-up for a blocked booking (copy and send it yourself; nothing is sent from here). */
export function FollowUp({ bookingId, refName, guestName }: { bookingId: string; refName: string; guestName: string }) {
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<FollowUpResult | null>(null);
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const show = (x: FollowUpResult) => {
    setR(x);
    if (x.ok) setBody(x.draft.body.replace(PAY_LINK, `${location.origin}${x.payPath}`));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setCopied(false);
        if (o) {
          setR(null); // no stale draft from the last time it was open
          start(async () => show(await draftFollowUpFor(bookingId)));
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" className="mt-2" data-testid={`booking-followup-${refName}`} />}>
        <MessageSquare aria-hidden />
        Message guest
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" data-testid="followup-dialog">
        <DialogHeader>
          <DialogTitle>Message {guestName}</DialogTitle>
          <DialogDescription>Copy it into email or chat. House Rules never sends messages for you.</DialogDescription>
        </DialogHeader>
        {!r && <p className="text-sm text-muted-foreground" data-testid="followup-loading">Drafting…</p>}
        {r && !r.ok && (
          <p role="alert" className="text-sm text-destructive" data-testid="followup-error">
            {r.error}
          </p>
        )}
        {r?.ok && (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="followup-subject">Subject</Label>
              <Input id="followup-subject" readOnly value={r.draft.subject} data-testid="followup-subject" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="followup-body">Message</Label>
              <Textarea id="followup-body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} data-testid="followup-body" />
            </div>
            {r.ai === "used" && (
              <p className="text-xs text-muted-foreground" data-testid="followup-ai-used">
                Reworded by NEAR AI with private inference. The amount and pay link were checked and are unchanged.
              </p>
            )}
            {r.ai === "kept_template" && (
              <p className="text-xs text-muted-foreground" data-testid="followup-ai-kept">
                NEAR AI&apos;s version changed a fact, so the original wording was kept.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(`${r.draft.subject}\n\n${body}`);
                  setCopied(true);
                }}
                data-testid="followup-copy"
              >
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied ? "Copied" : "Copy message"}
              </Button>
              {r.ai === "available" && (
                <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => show(await polishFollowUp(bookingId)))} data-testid="followup-polish">
                  <Sparkles aria-hidden />
                  {pending ? "Rewording…" : "Polish with NEAR AI"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
