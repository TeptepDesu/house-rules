import { Suspense } from "react";
import { AppNav } from "@/components/app-nav";
import { NetworkBanner } from "@/components/network-banner";
import { SessionFooter } from "@/components/session-footer";

function Wordmark() {
  return (
    <span className="text-[15px] font-semibold tracking-tight whitespace-nowrap">
      House Rules
    </span>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <NetworkBanner />
      <div className="flex flex-1">
        <aside className="hidden w-[232px] shrink-0 flex-col gap-6 border-r bg-sidebar p-4 md:flex" data-testid="app-sidebar">
          <Wordmark />
          <div className="flex-1">
            <AppNav />
          </div>
          <Suspense fallback={<div className="h-11 border-t" data-testid="session-loading" />}>
            <SessionFooter />
          </Suspense>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-4 border-b px-4 py-2 md:hidden" data-testid="app-topbar">
            <Wordmark />
            <AppNav orientation="horizontal" />
          </div>
          <main className="mx-auto w-full max-w-[1120px] flex-1 p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
