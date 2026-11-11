import Link from "next/link";
import { Suspense } from "react";
import { AppMenu, AppTabBar, AppTabs } from "@/components/app-nav";
import { Wordmark } from "@/components/brand";
import { NetworkBanner } from "@/components/network-banner";
import { MobileMenu } from "@/components/mobile-menu";
import { SessionMenu } from "@/components/session-menu";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <NetworkBanner />
      <header className="sticky top-0 z-30 hidden border-b bg-background md:block" data-testid="app-header">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 px-6 pt-2 xl:flex-nowrap xl:pt-0">
          <Link href="/" aria-label="House Rules, home" data-testid="app-home-link" className="shrink-0">
            <Wordmark />
          </Link>
          <AppTabs />
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <ThemeToggle />
            <Suspense fallback={<div className="h-9 w-24" data-testid="session-loading" />}>
              <SessionMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <MobileMenu
        summary={
          <>
            <Wordmark />
            <span className="rounded-full border px-3.5 py-1.5 text-sm font-semibold">
              <span className="group-open:hidden">Menu</span>
              <span className="hidden group-open:inline">Close</span>
            </span>
          </>
        }
      >
        <AppMenu />
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <Suspense fallback={<div className="h-9 w-24" data-testid="session-mobile-loading" />}>
            <SessionMenu variant="mobile" />
          </Suspense>
          <ThemeToggle testid="theme-toggle-mobile" />
        </div>
      </MobileMenu>
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-6 pb-28 md:px-6 md:pt-9 md:pb-16">{children}</main>
      <AppTabBar />
    </div>
  );
}
