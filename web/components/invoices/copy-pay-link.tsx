"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copies the absolute guest pay link for an invoice. */
export function CopyPayLink({ publicId }: { publicId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid={`copy-pay-link-${publicId}`}
      onClick={async () => {
        await navigator.clipboard.writeText(`${location.origin}/pay/${publicId}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      {copied ? "Copied" : "Copy pay link"}
    </Button>
  );
}
