"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createUser, findUserByEmail, logActivity } from "@/lib/db";
import { dummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";

export type AuthState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const email = z.email("Enter a valid email").transform((e) => e.trim().toLowerCase());
const password = z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters");

const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password") });
const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email,
  password,
});

function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = String(issue.path[0] ?? "form");
    out[k] ??= issue.message;
  }
  return out;
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    const user = await findUserByEmail(parsed.data.email);
    const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await dummyHash()));
    if (!user || !ok) return { error: "Email or password is incorrect" };

    await createSession(user.id);
    await logActivity({ userId: user.id, action: "login", entity: "user", entityId: user.id });
  } catch (e) {
    console.error("[auth.login] failed", e);
    return { error: "Something went wrong. Try again." };
  }
  redirect("/");
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    const user = await createUser({
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
    });
    if (!user) return { fieldErrors: { email: "An account with this email already exists" } };

    await createSession(user.id);
    await logActivity({ userId: user.id, action: "signup", entity: "user", entityId: user.id });
  } catch (e) {
    console.error("[auth.signup] failed", e);
    return { error: "Something went wrong. Try again." };
  }
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
