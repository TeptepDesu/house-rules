import { type NextRequest, NextResponse } from "next/server";
import { findUserById } from "@/lib/db";
import { SESSION_COOKIE, resolveSessionSecret, verifySession } from "@/lib/auth/token";

// Clears a session cookie that is validly signed but names a user this database doesn't have
// (e.g. a cookie from another local database: localhost cookies are shared across ports, and dev
// servers share the dev secret). proxy.ts trusts the signature and sends /login → /, while
// requireUser() can't find the user and sends / → /login: a redirect loop that blocks sign-in.
// requireUser() sends that case here instead. Server components can't delete cookies; a route
// handler can.
//
// It never signs out a real session: if the user exists, it just goes to the dashboard. So a link
// to this URL can't be used to log anyone out.

export async function GET(req: NextRequest) {
  const userId = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, resolveSessionSecret());
  if (userId) {
    let user;
    try {
      user = await findUserById(userId);
    } catch (e) {
      // a failed lookup isn't proof the user is gone: keep the session, the dashboard shows the error
      console.error("reset-session: user lookup failed", e);
      return NextResponse.redirect(new URL("/", req.url));
    }
    if (user) return NextResponse.redirect(new URL("/", req.url));
    console.warn("reset-session: clearing a session for a user that doesn't exist in this database");
  }
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
