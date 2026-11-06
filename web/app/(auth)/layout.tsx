import { Asterisk } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { PropertyCover } from "@/components/property-cover";
import { ThemeToggle } from "@/components/theme-toggle";

const STRIP = ["Guests pay from any chain", "Every booking reconciled", "Owners and cleaners paid in one click", "Your rules, enforced on NEAR"];

function Strip() {
  return (
    <>
      {STRIP.map((t) => (
        <span key={t} className="flex shrink-0 items-center gap-6 pr-6">
          {t}
          <Asterisk className="size-4" />
        </span>
      ))}
    </>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-full flex-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-brand-panel text-brand-panel-foreground" data-testid="auth-showcase">
        <div className="p-6 lg:p-10">
          <span className="inline-flex items-center gap-2 font-heading text-[19px] font-extrabold tracking-tight">
            <BrandMark />
            House Rules
          </span>
          <p className="mt-8 font-heading text-[44px] leading-[0.95] font-extrabold tracking-[-0.03em] uppercase sm:text-[64px] lg:mt-14 xl:text-[84px]">
            Your homes.
            <br />
            Your rules.
          </p>
          <p className="mt-5 max-w-md font-mono text-sm leading-relaxed text-brand-panel-muted lg:text-[15px]">
            The back office for short-term rentals. Guests pay, bookings reconcile, and everyone gets paid, within limits no one can break.
          </p>
        </div>
        <div className="hidden lg:block">
          <div className="grid grid-cols-3 gap-3 px-10 pb-8">
            <PropertyCover name="Rose Cottage" className="aspect-[4/3] rounded-2xl" />
            <PropertyCover name="Loft 21" className="aspect-[4/3] rounded-2xl" />
            <PropertyCover name="Surf Shack" className="aspect-[4/3] rounded-2xl" />
          </div>
          <div aria-hidden className="label-caps overflow-hidden border-t border-white/25 py-3 text-[12px]">
            <div className="marquee flex w-max">
              <Strip />
              <Strip />
            </div>
          </div>
        </div>
      </section>
      <section className="relative flex items-center justify-center p-6 lg:p-10">
        <ThemeToggle className="absolute top-5 right-5" testid="auth-theme-toggle" />
        {children}
      </section>
    </main>
  );
}
