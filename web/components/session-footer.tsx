import { logout } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/auth/dal";
import { Button } from "@/components/ui/button";

/** Reads the session: render inside <Suspense> (cacheComponents). */
export async function SessionFooter() {
  const user = await requireUser();
  return (
    <div className="flex items-center justify-between gap-2 border-t pt-3 text-sm">
      <div className="min-w-0">
        <div className="truncate font-medium" data-testid="session-user-name">
          {user.name}
        </div>
        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
      </div>
      <form action={logout} data-testid="session-logout-form">
        <Button type="submit" variant="ghost" size="sm" data-testid="session-logout">
          Sign out
        </Button>
      </form>
    </div>
  );
}
