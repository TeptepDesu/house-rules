import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { signup } from "../actions";

export const metadata: Metadata = { title: "Create account · SettleStay" };

export default function SignupPage() {
  return <AuthForm mode="signup" action={signup} />;
}
