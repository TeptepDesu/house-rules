"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { useTransition } from "react";
import { logout } from "@/app/(auth)/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Desktop: the avatar and name open a menu with who's signed in and Sign out (the Airbnb/GitHub pattern). */
export function ProfileMenu({ name, email, initials }: { name: string; email: string; initials: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-w-0 items-center gap-2 rounded-full py-1 pr-2.5 pl-1 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted"
        data-testid="session-menu-trigger"
      >
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">
          {initials}
        </span>
        <span className="max-w-36 truncate font-semibold" data-testid="session-user-name">
          {name}
        </span>
        <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60 rounded-xl p-1.5" data-testid="session-menu">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2.5 py-2">
            <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground" data-testid="session-user-email">
              {email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          disabled={pending}
          onClick={() => startTransition(() => logout())}
          data-testid="session-logout"
        >
          <LogOut aria-hidden />
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
