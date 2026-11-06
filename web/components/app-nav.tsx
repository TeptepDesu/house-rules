"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, LayoutDashboard, Receipt, ScrollText, Settings, ShieldCheck, Upload, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

// Only screens that exist are listed; add an entry when its page ships.
const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, testid: "nav-overview", tab: true },
  { href: "/bookings", label: "Bookings", icon: CalendarDays, testid: "nav-bookings", tab: true },
  { href: "/invoices", label: "Invoices", icon: Receipt, testid: "nav-invoices", tab: true },
  { href: "/payouts", label: "Payouts", icon: Wallet, testid: "nav-payouts", tab: true },
  { href: "/people", label: "Homes & people", short: "Homes", icon: Home, testid: "nav-people", tab: true },
  { href: "/rules", label: "Vault rules", icon: ShieldCheck, testid: "nav-rules", tab: false },
  { href: "/audit", label: "Audit log", icon: ScrollText, testid: "nav-audit", tab: false },
  { href: "/import", label: "Import", icon: Upload, testid: "nav-import", tab: false },
  { href: "/settings", label: "Settings", icon: Settings, testid: "nav-settings", tab: false },
] as const satisfies readonly { href: string; label: string; icon: unknown; testid: string; tab: boolean; short?: string }[];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

/** Desktop: a strip of icon-over-label tabs, underlined when active. */
export function AppTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Main" data-testid="app-nav-tabs" className="order-last flex w-full min-w-0 items-stretch justify-between gap-1 overflow-x-auto xl:order-none xl:w-auto xl:justify-center">
      {NAV.map(({ href, label, icon: Icon, testid }) => {
        const active = isActive(path, href);
        return (
          <Link
            key={href}
            href={href}
            data-testid={testid}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 flex-col items-center gap-1 border-b-2 px-3 pt-2.5 pb-2 text-xs font-medium whitespace-nowrap transition-colors",
              active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <Icon aria-hidden className={cn("size-[22px]", active && "text-primary")} strokeWidth={active ? 2.25 : 1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The full list inside the phone menu. */
export function AppMenu() {
  const path = usePathname();
  return (
    <nav aria-label="All pages" data-testid="app-nav-menu" className="grid grid-cols-2 gap-1.5">
      {NAV.map(({ href, label, icon: Icon, testid }) => {
        const active = isActive(path, href);
        return (
          <Link
            key={href}
            href={href}
            data-testid={testid.replace(/^nav-/, "nav-mobile-")}
            aria-current={active ? "page" : undefined}
            className={cn("flex h-11 items-center gap-2.5 rounded-xl px-3 text-sm", active ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-accent/60")}
          >
            <Icon aria-hidden className={cn("size-[18px] shrink-0", active && "text-primary")} />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone: the five everyday screens, always in reach of a thumb. */
export function AppTabBar() {
  const path = usePathname();
  return (
    <nav
      aria-label="Quick"
      data-testid="app-tabbar"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV.filter((n) => n.tab).map((item) => {
        const { href, label, icon: Icon, testid } = item;
        const active = isActive(path, href);
        return (
          <Link
            key={href}
            href={href}
            data-testid={testid.replace(/^nav-/, "tab-")}
            aria-current={active ? "page" : undefined}
            className={cn("flex min-w-0 flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}
          >
            <Icon aria-hidden className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} />
            <span className="max-w-full truncate px-1">{"short" in item ? item.short : label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
