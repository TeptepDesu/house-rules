import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <header className="flex items-center justify-between border-b pb-4">
        <span className="font-semibold">SettleStay</span>
        <Suspense fallback={<span className="text-sm text-muted-foreground" data-testid="session-loading">…</span>}>
          <SessionBar />
        </Suspense>
      </header>
      <section className="py-10" data-testid="dashboard-empty">
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Properties, payees, and payouts will show up here.</p>
      </section>
    </main>
  );
}

async function SessionBar() {
  const user = await requireUser();
  return (
    <div className="flex items-center gap-3 text-sm">
      <span data-testid="session-user-name">{user.name}</span>
      <form action={logout}>
        <Button type="submit" variant="outline" size="sm" data-testid="session-logout">
          Sign out
        </Button>
      </form>
    </div>
  );
}
