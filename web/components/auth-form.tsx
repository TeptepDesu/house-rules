"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "signup";

const copy = {
  login: { title: "Sign in to House Rules", desc: "Your payout rules, enforced on-chain.", cta: "Sign in", alt: "No account yet?", altLink: "Create one", altHref: "/signup" },
  signup: { title: "Create your operator account", desc: "Set the rules once. The vault enforces them.", cta: "Create account", alt: "Already have an account?", altLink: "Sign in", altHref: "/login" },
} as const;

export function AuthForm({ mode, action }: { mode: Mode; action: (s: AuthState, f: FormData) => Promise<AuthState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const c = copy[mode];
  const fe = state?.fieldErrors ?? {};
  const values: Record<string, string | undefined> = state?.values ?? {};

  const field = (name: string, label: string, type: string, autoComplete: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`${mode}-${name}`}>{label}</Label>
      <Input
        id={`${mode}-${name}`}
        name={name}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={fe[name] ? true : undefined}
        aria-describedby={fe[name] ? `${mode}-${name}-error` : undefined}
        data-testid={`${mode}-${name}-input`}
        defaultValue={type === "password" ? undefined : values[name]}
        required
      />
      {fe[name] && (
        <p id={`${mode}-${name}-error`} className="text-sm text-destructive" data-testid={`${mode}-${name}-error`}>
          {fe[name]}
        </p>
      )}
    </div>
  );

  return (
    <Card className="w-full max-w-sm" data-testid={`${mode}-card`}>
      <CardHeader>
        <CardTitle>{c.title}</CardTitle>
        <CardDescription>{c.desc}</CardDescription>
      </CardHeader>
      <form action={formAction} noValidate data-testid={`${mode}-form`}>
        <CardContent className="grid gap-4">
          {mode === "signup" && field("name", "Name", "text", "name")}
          {field("email", "Email", "email", "email")}
          {field("password", "Password", "password", mode === "login" ? "current-password" : "new-password")}
          {state?.error && (
            <p role="alert" className="text-sm text-destructive" data-testid={`${mode}-form-error`}>
              {state.error}
            </p>
          )}
        </CardContent>
        <CardFooter className="mt-6 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={pending} data-testid={`${mode}-submit`}>
            {pending ? "Please wait…" : c.cta}
          </Button>
          <p className="text-sm text-muted-foreground">
            {c.alt}{" "}
            <Link href={c.altHref} className="text-foreground underline underline-offset-4" data-testid={`${mode}-alt-link`}>
              {c.altLink}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
