import { logout } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/auth/dal";
import { Button } from "@/components/ui/button";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase())
    .join("");

/** Who's signed in, as an avatar and name. Reads the session: render inside <Suspense> (cacheComponents). */
export async function SessionMenu({ testidPrefix = "session" }: { testidPrefix?: string }) {
  const user = await requireUser();
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-sm" title={user.email}>
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">
        {initials(user.name) || "?"}
      </span>
      <span className="max-w-36 truncate font-semibold" data-testid={`${testidPrefix}-user-name`}>
        {user.name}
      </span>
      <form action={logout} data-testid={`${testidPrefix}-logout-form`}>
        <Button type="submit" variant="ghost" size="sm" data-testid={`${testidPrefix}-logout`}>
          Sign out
        </Button>
      </form>
    </div>
  );
}
