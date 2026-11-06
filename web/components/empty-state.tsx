import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  body,
  action,
  className,
  ...props
}: { title: string; body: string; action?: React.ReactNode } & Omit<React.ComponentProps<"div">, "children" | "title">) {
  return (
    <div className={cn("rounded-2xl border bg-card px-6 py-11 text-center", className)} {...props}>
      <BrandMark className="mx-auto mb-3 size-7 text-muted-foreground/50" />
      <p className="font-heading text-lg font-bold tracking-tight">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
