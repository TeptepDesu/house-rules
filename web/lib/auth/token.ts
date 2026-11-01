import { SignJWT, jwtVerify } from "jose";

// Pure JWT helpers: no Next.js imports, so proxy.ts and unit tests can use them.

export const SESSION_COOKIE = "hr_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Used only when SESSION_SECRET is unset outside production, so local dev works with no .env.local.
export const DEV_SESSION_SECRET = "dev-only-insecure-session-secret-do-not-use-in-prod";

/** SESSION_SECRET, or the dev fallback outside production. Throws in production when unset. */
export function resolveSessionSecret(env: { SESSION_SECRET?: string; NODE_ENV?: string } = process.env): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
  return DEV_SESSION_SECRET;
}

function key(secret: string) {
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: string, secret: string, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_SECONDS)
    .sign(key(secret));
}

/** Returns the user id, or null for a missing, tampered, or expired token. */
export async function verifySession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      currentDate: new Date(now),
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
