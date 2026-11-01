import { describe, expect, it } from "vitest";
import { SESSION_TTL_SECONDS, signSession, verifySession } from "./token";

const SECRET = "test-secret-test-secret-test-secret!!";
const OTHER = "another-secret-another-secret-another";
const USER = "6f1c2a8e-0000-4000-8000-000000000001";

describe("session token", () => {
  it("round-trips the user id", async () => {
    const t = await signSession(USER, SECRET);
    expect(await verifySession(t, SECRET)).toBe(USER);
  });

  it("rejects a missing token", async () => {
    expect(await verifySession(undefined, SECRET)).toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const t = await signSession(USER, OTHER);
    expect(await verifySession(t, SECRET)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const [h, , s] = (await signSession(USER, SECRET)).split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "attacker" })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`, SECRET)).toBeNull();
  });

  it("rejects alg=none", async () => {
    const h = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const p = Buffer.from(JSON.stringify({ sub: USER })).toString("base64url");
    expect(await verifySession(`${h}.${p}.`, SECRET)).toBeNull();
  });

  it("expires after the TTL", async () => {
    const now = Date.UTC(2026, 10, 1);
    const t = await signSession(USER, SECRET, now);
    expect(await verifySession(t, SECRET, now + (SESSION_TTL_SECONDS - 60) * 1000)).toBe(USER);
    expect(await verifySession(t, SECRET, now + (SESSION_TTL_SECONDS + 60) * 1000)).toBeNull();
  });

  it("refuses a short secret", async () => {
    await expect(signSession(USER, "short")).rejects.toThrow(/at least 32/);
  });
});

describe("resolveSessionSecret", async () => {
  const { resolveSessionSecret, DEV_SESSION_SECRET } = await import("./token");
  it("uses SESSION_SECRET when set", () => {
    expect(resolveSessionSecret({ SESSION_SECRET: SECRET, NODE_ENV: "production" })).toBe(SECRET);
  });
  it("falls back to the dev secret outside production", () => {
    expect(resolveSessionSecret({ NODE_ENV: "development" })).toBe(DEV_SESSION_SECRET);
    expect(resolveSessionSecret({ NODE_ENV: "test" })).toBe(DEV_SESSION_SECRET);
  });
  it("refuses to run in production without a secret", () => {
    expect(() => resolveSessionSecret({ NODE_ENV: "production" })).toThrow(/SESSION_SECRET/);
  });
});
