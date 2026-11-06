import { cn } from "@/lib/utils";

// Our own mark: a house drawn on the same dot grid as the home covers.
const HOUSE = ["....#....", "...###...", "..#####..", ".#######.", "#########", ".##...##.", ".##.#.##.", ".##...##.", ".#######."];
const MARK = HOUSE.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? `M${x + 0.1} ${y + 0.1}h.8v.8h-.8z` : ""))).join("");

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 9 9" aria-hidden className={cn("size-6 shrink-0", className)}>
      <path d={MARK} fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-heading text-[19px] leading-none font-extrabold tracking-tight whitespace-nowrap", className)}>
      <BrandMark className="text-primary" />
      House Rules
    </span>
  );
}
