"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Last-resort boundary. Never shows the error itself: details go to the console, not the page. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <div role="alert" className="max-w-sm text-center" data-testid="app-error">
        <h1 className="text-[22px] font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">No money moved because of this page. Try again, and if it keeps happening, reload.</p>
        <Button variant="outline" className="mt-4" onClick={() => retry()} data-testid="app-error-retry">
          Try again
        </Button>
      </div>
    </main>
  );
}
