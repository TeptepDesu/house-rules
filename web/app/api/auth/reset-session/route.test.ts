import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUserById = vi.fn();
vi.mock("@/lib/db", () => ({ findUserById }));
vi.mock("@/lib/auth/token", () => ({ SESSION_COOKIE: "hr_session", resolveSessionSecret: () => "s", verifySession: async (v?: string) => v ?? null }));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://localhost/api/auth/reset-session", { headers: { cookie: "hr_session=user-1" } }));
const cleared = (r: Response) => /hr_session=;/.test(r.headers.get("set-cookie") ?? "");

describe("reset-session", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("clears a session for a user this database doesn't have", async () => {
    findUserById.mockResolvedValue(undefined);
    const r = await call();
    expect(cleared(r)).toBe(true);
    expect(r.headers.get("location")).toContain("/login");
  });

  it("never signs out a real user", async () => {
    findUserById.mockResolvedValue({ id: "user-1" });
    const r = await call();
    expect(cleared(r)).toBe(false);
    expect(new URL(r.headers.get("location")!).pathname).toBe("/");
  });

  it("a database failure isn't proof the user is gone: the session stays", async () => {
    findUserById.mockRejectedValue(new Error("connection refused"));
    const r = await call();
    expect(cleared(r)).toBe(false);
    expect(new URL(r.headers.get("location")!).pathname).toBe("/");
  });
});
