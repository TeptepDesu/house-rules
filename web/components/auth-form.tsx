"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup";

const copy = {
  login: { title: "Welcome back", desc: "Sign in to see what's collected and who's due.", cta: "Sign in", alt: "New to House Rules?", altLink: "Create an account", altHref: "/signup" },
  signup: { title: "Set your house rules", desc: "Decide once who gets paid and how much. The vault holds everyone to it.", cta: "Create account", alt: "Already have an account?", altLink: "Sign in", altHref: "/login" },
} as const;

export function AuthForm({ mode, action }: { mode: Mode; action: (s: AuthState, f: FormData) => Promise<AuthState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const c = copy[mode];
  const fe = state?.fieldErrors ?? {};
  const values: Record<string, string | undefined> = state?.values ?? {};
  const fields = [
    ...(mode === "signup" ? [{ name: "name", label: "Name", type: "text", auto: "name" }] : []),
    { name: "email", label: "Email", type: "email", auto: "email" },
    { name: "password", label: "Password", type: "password", auto: mode === "login" ? "current-password" : "new-password" },
  ];

  return (
    <div className="w-full max-w-[400px]" data-testid={`${mode}-card`}>
      <h1 className="font-heading text-[36px] leading-none font-extrabold tracking-tight">{c.title}</h1>
      <p className="mt-3 text-[15px] text-muted-foreground">{c.desc}</p>
      <form action={formAction} noValidate data-testid={`${mode}-form`} className="mt-8">
        {/* Stacked fields that read as one control: the labels live inside it. */}
        <div className="divide-y divide-input overflow-hidden rounded-2xl border border-input bg-card">
          {fields.map((f) => (
            <div key={f.name} className={cn("px-4 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset", fe[f.name] && "bg-destructive-soft ring-2 ring-destructive ring-inset")}>
              <label htmlFor={`${mode}-${f.name}`} className="block text-xs font-semibold text-muted-foreground">
                {f.label}
              </label>
              <input
                id={`${mode}-${f.name}`}
                name={f.name}
                type={f.type}
                autoComplete={f.auto}
                aria-invalid={fe[f.name] ? true : undefined}
                aria-describedby={fe[f.name] ? `${mode}-${f.name}-error` : undefined}
                data-testid={`${mode}-${f.name}-input`}
                defaultValue={f.type === "password" ? undefined : values[f.name]}
                required
                className="mt-0.5 w-full bg-transparent text-base outline-none"
              />
            </div>
          ))}
        </div>
        <div className="mt-2 grid gap-1 empty:hidden">
          {fields.map(
            (f) =>
              fe[f.name] && (
                <p key={f.name} id={`${mode}-${f.name}-error`} className="text-sm text-destructive" data-testid={`${mode}-${f.name}-error`}>
                  {fe[f.name]}
                </p>
              ),
          )}
          {state?.error && (
            <p role="alert" className="text-sm text-destructive" data-testid={`${mode}-form-error`}>
              {state.error}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" className="mt-5 w-full" disabled={pending} data-testid={`${mode}-submit`}>
          {pending ? "Please wait…" : c.cta}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        {c.alt}{" "}
        <Link href={c.altHref} className="font-semibold text-foreground underline underline-offset-4" data-testid={`${mode}-alt-link`}>
          {c.altLink}
        </Link>
      </p>
    </div>
  );
}
