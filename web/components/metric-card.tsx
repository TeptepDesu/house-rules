import { cn } from "@/lib/utils";

/** A number with its label. Inside a <MetricBand> it sits on the blue panel. */
export function MetricCard({
  label,
  value,
  context,
  band,
  className,
  ...props
}: { label: string; value: React.ReactNode; context?: string; band?: boolean } & Omit<React.ComponentProps<"div">, "children">) {
  return (
    <div className={cn(band ? "min-w-0 p-4 md:p-6" : "rounded-2xl border bg-card p-5 shadow-soft", className)} {...props}>
      <p className={cn("label-caps", band ? "text-brand-panel-muted" : "text-muted-foreground")}>{label}</p>
      <p className="tabular mt-2 font-heading text-[25px] leading-none font-bold tracking-tight md:text-[34px]">{value}</p>
      {context && <p className={cn("mt-2 text-[13px]", band ? "text-brand-panel-muted" : "text-muted-foreground")}>{context}</p>}
    </div>
  );
}

/** The one saturated panel on a page: the numbers that matter most. */
export function MetricBand({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-white/20 text-brand-panel-foreground lg:grid-cols-4 [&>*]:bg-brand-panel",
        className,
      )}
      {...props}
    />
  );
}
