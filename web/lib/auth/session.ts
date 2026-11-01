import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, resolveSessionSecret, signSession, verifySession } from "./token";

const sessionSecret = () => resolveSessionSecret();

export async function createSession(userId: string) {
  const token = await signSession(userId, sessionSecret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionUserId(): Promise<string | null> {
  // Expiry is checked against the current time; tell Cache Components this is request-time work.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token, sessionSecret());
}
