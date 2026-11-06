"use client";

import { Moon, Sun } from "lucide-react";
import { applyTheme, currentTheme } from "@/lib/ui/theme";
import { cn } from "@/lib/utils";

/**
 * Sun/moon switch. Icon and accessible name come from the `dark:` variant, not React state,
 * so the server HTML is right for either theme and hydration never mismatches.
 */
export function ThemeToggle({ className, testid = "theme-toggle" }: { className?: string; testid?: string }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={() => applyTheme(currentTheme() === "dark" ? "light" : "dark")}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <Sun aria-hidden className="hidden size-4 dark:block" />
      <Moon aria-hidden className="size-4 dark:hidden" />
      <span className="sr-only dark:hidden">Switch to dark theme</span>
      <span className="sr-only hidden dark:inline">Switch to light theme</span>
    </button>
  );
}
