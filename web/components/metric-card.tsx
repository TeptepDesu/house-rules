import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  context,
  className,
  ...props
}: { label: string; value: React.ReactNode; context?: string } & Omit<React.ComponentProps<"div">, "children">) {
  return (
    <div className={cn("rounded-[10px] border bg-card p-4", className)} {...props}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-[28px] leading-tight font-semibold">{value}</p>
      {context && <p className="mt-1 text-xs text-muted-foreground">{context}</p>}
    </div>
  );
}
