import { cn } from "@/lib/utils";

/** Names before addresses: "Maria Santos · Cleaner" with the NEAR account in small mono below. */
export function AccountName({
  name,
  role,
  account,
  className,
  ...props
}: { name: string; role?: string; account: string } & Omit<React.ComponentProps<"div">, "children">) {
  return (
    <div className={cn("min-w-0", className)} {...props}>
      <div className="truncate font-medium">
        {name}
        {role && <span className="font-normal text-muted-foreground"> · {role}</span>}
      </div>
      <div className="truncate font-mono text-xs text-muted-foreground">{account}</div>
    </div>
  );
}
