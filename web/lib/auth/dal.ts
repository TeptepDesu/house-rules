import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { findUserById } from "@/lib/db";
import { getSessionUserId } from "./session";

// Data Access Layer: the real auth check. proxy.ts is only an optimistic redirect.

export type CurrentUser = { id: string; name: string; email: string };

/** Use in server components, actions, and route handlers. Redirects to /login if signed out. */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const user = await findUserById(userId);
  // Signed cookie, unknown user: proxy.ts would bounce /login straight back here, forever.
  // Clear the cookie first (server components can't; the route handler can).
  if (!user) redirect("/api/auth/reset-session");
  return { id: user.id, name: user.name, email: user.email };
});
