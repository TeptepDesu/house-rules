import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { login } from "../actions";

export const metadata: Metadata = { title: "Sign in · House Rules" };

export default function LoginPage() {
  return <AuthForm mode="login" action={login} />;
}
