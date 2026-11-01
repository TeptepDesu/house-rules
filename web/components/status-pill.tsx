import { type StatusKind, type Tone, statusOf } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

const TONE: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  destructive: "bg-destructive-soft text-destructive",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
};

export function StatusPill<K extends StatusKind>({
  kind,
  status,
  className,
  ...props
}: { kind: K; status: string } & Omit<React.ComponentProps<"span">, "children">) {
  const s = statusOf(kind, status as never);
  return (
    <span
      data-status={status}
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", TONE[s.tone], className)}
      {...props}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
