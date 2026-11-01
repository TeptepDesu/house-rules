"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, Receipt, ScrollText, Settings, ShieldCheck, Upload, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

// Only screens that exist are listed; add an entry when its page ships.
const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, testid: "nav-overview" },
  { href: "/bookings", label: "Bookings", icon: CalendarDays, testid: "nav-bookings" },
  { href: "/invoices", label: "Invoices", icon: Receipt, testid: "nav-invoices" },
  { href: "/payouts", label: "Payouts", icon: Wallet, testid: "nav-payouts" },
  { href: "/rules", label: "Vault rules", icon: ShieldCheck, testid: "nav-rules" },
  { href: "/audit", label: "Audit log", icon: ScrollText, testid: "nav-audit" },
  { href: "/people", label: "People & properties", icon: Users, testid: "nav-people" },
  { href: "/import", label: "Import", icon: Upload, testid: "nav-import" },
  { href: "/settings", label: "Settings", icon: Settings, testid: "nav-settings" },
] as const satisfies readonly { href: string; label: string; icon: unknown; testid: string }[];

export function AppNav({ orientation = "vertical" }: { orientation?: "vertical" | "horizontal" }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" data-testid={`app-nav-${orientation}`} className={cn(orientation === "vertical" ? "flex flex-col gap-0.5" : "grid grid-cols-2 gap-1")}>
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
