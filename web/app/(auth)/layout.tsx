import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-full flex-1 items-center justify-center p-6">
      <ThemeToggle className="absolute top-4 right-4" testid="auth-theme-toggle" />
      {children}
    </main>
  );
}
