import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { THEME_INIT_SCRIPT } from "@/lib/ui/theme";

const body = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "House Rules",
  description: "Your payout rules, enforced on-chain. Autonomous payouts for short-term rental operators.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Dark by default. The inline script drops `dark` before first paint if the visitor chose light;
    // suppressHydrationWarning lets React keep that class (lib/ui/theme.ts).
    <html
      lang="en"
      className={cn(body.variable, display.variable, plexMono.variable, "dark h-full antialiased")}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
