import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

// Optimistic gate only. The real check is requireUser() in lib/auth/dal.ts,
// and every route handler/action re-verifies the session itself.

const AUTH_PAGES = ["/login", "/signup"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const secret = process.env.SESSION_SECRET ?? "";
  const userId = secret ? await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret) : null;
  const onAuthPage = AUTH_PAGES.includes(pathname);

  if (!userId && !onAuthPage) return NextResponse.redirect(new URL("/login", req.url));
  if (userId && onAuthPage) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  // Skip API routes (they authenticate themselves), the public guest pay page, and static assets.
  matcher: ["/((?!api|pay|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
