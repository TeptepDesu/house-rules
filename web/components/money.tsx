import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Every displayed amount goes through here: formatUsd + tabular figures. */
export function Money({ raw, exact, className, ...props }: { raw: bigint; exact?: boolean } & Omit<React.ComponentProps<"span">, "children">) {
  return (
    <span className={cn("tabular", raw < 0n && "text-destructive", className)} {...props}>
      {formatUsd(raw, { exact })}
    </span>
  );
}
