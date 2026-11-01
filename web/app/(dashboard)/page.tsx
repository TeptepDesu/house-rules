import Link from "next/link";
import { Suspense } from "react";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { setupCounts } from "@/lib/db/people";
import { cn } from "@/lib/utils";

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="Collected, reconciled, and paid out within your rules." />
      <Suspense fallback={<p className="text-sm text-muted-foreground" data-testid="overview-loading">Loading…</p>}>
        <SetupChecklist />
      </Suspense>
    </>
  );
}

async function SetupChecklist() {
  const user = await requireUser();
  const c = await setupCounts(user.id);
  const steps = [
    { id: "payees", done: c.payees > 0, title: "Add the people you pay", body: "Owners and cleaners, each with a maximum per payout.", href: "/people", cta: "Add payees" },
    {
      id: "sign",
      done: c.activePayees > 0,
      title: "Approve payees in your vault",
      body: "You sign once with your wallet; new payees then wait out the safety delay before they can be paid.",
      href: "/people",
      cta: "Review payees",
    },
    { id: "properties", done: c.properties > 0, title: "Add your properties", body: "Cleaning fee and management % decide each payout split.", href: "/people", cta: "Add properties" },
  ];
  const next = steps.find((s) => !s.done);

  return (
    <section aria-labelledby="setup-title" className="max-w-2xl rounded-[10px] border bg-card" data-testid="setup-checklist">
      <div className="border-b px-4 py-3">
        <h2 id="setup-title" className="text-[15px] font-semibold">
          {next ? "Get set up" : "You're set up"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {steps.filter((s) => s.done).length} of {steps.length} done
        </p>
      </div>
      <ol>
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0" data-testid={`setup-step-${s.id}`} data-done={s.done}>
            <span
              aria-hidden
              className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", s.done && "border-success bg-success text-primary-foreground")}
            >
              {s.done && <Check className="size-3" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium", s.done && "text-muted-foreground line-through decoration-1")}>{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </div>
            {next?.id === s.id && (
              <Link href={s.href} className={buttonVariants({ size: "sm" })} data-testid={`setup-step-${s.id}-cta`}>
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
