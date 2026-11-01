import { ArrowUpRight } from "lucide-react";
import { explorerTxUrl, networkId } from "@/lib/near/network";
import { cn } from "@/lib/utils";

/** Hashes hide behind "View on-chain". Server component: reads NEAR_NETWORK. */
export function TxLink({ hash, className, ...props }: { hash: string } & Omit<React.ComponentProps<"a">, "href" | "children">) {
  return (
    <a
      href={explorerTxUrl(hash, networkId())}
      target="_blank"
      rel="noreferrer"
      className={cn("inline-flex items-center gap-0.5 text-sm text-primary underline-offset-4 hover:underline", className)}
      {...props}
    >
      View on-chain
      <ArrowUpRight aria-hidden className="size-3.5" />
    </a>
  );
}
