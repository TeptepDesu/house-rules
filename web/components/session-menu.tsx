import { logout } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/auth/dal";
import { Button } from "@/components/ui/button";
import { ProfileMenu } from "@/components/profile-menu";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase())
    .join("");

/**
 * Who's signed in. Reads the session: render inside <Suspense> (cacheComponents).
 * Desktop: an avatar menu with Sign out. Phone: inline, because it already sits inside the phone menu.
 */
export async function SessionMenu({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const user = await requireUser();
  if (variant === "desktop") return <ProfileMenu name={user.name} email={user.email} initials={initials(user.name) || "?"} />;
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-sm" title={user.email}>
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">
        {initials(user.name) || "?"}
      </span>
      <span className="max-w-36 truncate font-semibold" data-testid="session-mobile-user-name">
        {user.name}
      </span>
      <form action={logout} data-testid="session-mobile-logout-form">
        <Button type="submit" variant="ghost" size="sm" data-testid="session-mobile-logout">
          Sign out
        </Button>
      </form>
    </div>
  );
}
