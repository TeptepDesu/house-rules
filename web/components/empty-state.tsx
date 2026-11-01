import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  body,
  action,
  className,
  ...props
}: { title: string; body: string; action?: React.ReactNode } & Omit<React.ComponentProps<"div">, "children" | "title">) {
  return (
    <div className={cn("rounded-[10px] border border-dashed px-6 py-10 text-center", className)} {...props}>
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
