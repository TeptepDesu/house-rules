import { beforeEach, describe, expect, it } from "vitest";

// Real Postgres semantics via in-memory PGlite, with the real migrations applied.
process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;

const db = await import("./index");

describe("db (PGlite, migrated)", () => {
  beforeEach(() => db.__resetDbForTests()); // fresh in-memory database per test

  it("creates a user and finds them by email and id", async () => {
    const u = await db.createUser({ email: "maria@example.com", name: "Maria", passwordHash: "h" });
    expect(u?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await db.findUserByEmail("maria@example.com"))?.id).toBe(u!.id);
    expect((await db.findUserById(u!.id))?.name).toBe("Maria");
  });

  it("returns undefined instead of throwing on a duplicate email", async () => {
    await db.createUser({ email: "dup@example.com", name: "A", passwordHash: "h" });
    expect(await db.createUser({ email: "dup@example.com", name: "B", passwordHash: "h" })).toBeUndefined();
  });

  it("logs activity linked to a user", async () => {
    const u = await db.createUser({ email: "log@example.com", name: "L", passwordHash: "h" });
    await expect(db.logActivity({ userId: u!.id, action: "signup", entity: "user", entityId: u!.id })).resolves.toBeUndefined();
  });

  it("rejects activity for a user that doesn't exist (FK)", async () => {
    await expect(
      db.logActivity({ userId: "00000000-0000-4000-8000-000000000000", action: "x", entity: "user" }),
    ).rejects.toThrow();
  });
});

describe("db client startup", () => {
  it("creates a missing nested data directory", async () => {
    const { mkdtempSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = `${mkdtempSync(`${tmpdir()}/hr-db-`)}/does/not/exist/yet`;
    const { createDb } = await import("./client");
    const d = await createDb({ PGLITE_DIR: dir, NODE_ENV: "test" } as NodeJS.ProcessEnv);
    expect(existsSync(dir)).toBe(true);
    expect(d).toBeTruthy();
  });

  it("refuses to fall back to PGlite in production", async () => {
    const { createDb } = await import("./client");
    await expect(createDb({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).rejects.toThrow(/DATABASE_URL/);
  });
});
