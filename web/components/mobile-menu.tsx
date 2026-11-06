"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** The phone menu. It sits above the page, so it closes itself when a link changes the page. */
export function MobileMenu({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [path]);
  return (
    <details ref={menu} className="group sticky top-0 z-30 border-b bg-background md:hidden" data-testid="app-topbar">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden" data-testid="app-menu-toggle">
        {summary}
      </summary>
      {/* leaves room for the top bar and the bottom tab bar, so Sign out is reachable in landscape */}
      <div className="max-h-[calc(100dvh-10rem)] space-y-3 overflow-y-auto px-3 pb-3">{children}</div>
    </details>
  );
}
