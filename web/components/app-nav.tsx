"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// Only screens that exist are listed; add an entry when its page ships
// (planned: Bookings, Invoices, Payouts, Vault rules, Audit log, Import — design.md § Layout).
const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, testid: "nav-overview" },
  { href: "/people", label: "People & properties", icon: Users, testid: "nav-people" },
] as const satisfies readonly { href: string; label: string; icon: unknown; testid: string }[];

export function AppNav({ orientation = "vertical" }: { orientation?: "vertical" | "horizontal" }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" data-testid={`app-nav-${orientation}`} className={cn(orientation === "vertical" ? "flex flex-col gap-0.5" : "flex gap-1 overflow-x-auto")}>
      {NAV.map(({ href, label, icon: Icon, testid }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            data-testid={orientation === "vertical" ? testid : testid.replace(/^nav-/, "nav-mobile-")}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
              active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon aria-hidden className={cn("size-4", active && "text-primary")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
