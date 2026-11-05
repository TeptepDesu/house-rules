import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found · House Rules" };

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center" data-testid="not-found">
        <h1 className="text-[22px] font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page doesn&apos;t exist. If someone sent you a payment link, ask them for a new one.</p>
        <Link href="/" className={buttonVariants({ variant: "outline", className: "mt-4" })} data-testid="not-found-home">
          Go to House Rules
        </Link>
      </div>
    </main>
  );
}
