import { formatUsd } from "@/lib/money";
import { type WeekCollected, barPermille } from "@/lib/overview";
import { shortDate } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

const bookingsLabel = (n: number) => `${n} ${n === 1 ? "booking" : "bookings"}`;

/**
 * Money collected per check-in week. One series, so no legend: the title names it. Server-rendered
 * with no chart library. Hover and keyboard focus show the same tooltip, the tallest week is
 * labelled directly, and the table underneath holds every exact value.
 */
export function WeeklyCollectedChart({ weeks }: { weeks: WeekCollected[] }) {
  const max = weeks.reduce((a, w) => (w.collected > a ? w.collected : a), 0n);
  const peak = weeks.findIndex((w) => w.collected === max);
  // with many weeks the end columns are narrow: keep labels and tooltips inside the card
  const align = (i: number) => (weeks.length > 5 && i === 0 ? "left-0" : weeks.length > 5 && i === weeks.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2");

  return (
    <section aria-labelledby="collected-chart-title" className="min-w-0" data-testid="overview-collected-chart">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="collected-chart-title" className="text-[20px] font-bold tracking-tight">
          Collected by week
        </h2>
        <p className="text-xs text-muted-foreground">Week of check-in</p>
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <ol className="flex h-44 items-stretch gap-0.5 pt-6">
          {weeks.map((w, i) => (
            <li
              key={w.weekStart}
              tabIndex={0}
              aria-label={`Week of ${shortDate(w.weekStart)}: ${formatUsd(w.collected)} from ${bookingsLabel(w.bookings)}`}
              data-testid={`overview-collected-week-${w.weekStart}`}
              className="group relative flex min-w-0 flex-1 flex-col justify-end rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="relative flex flex-1 items-end justify-center border-b">
                {w.collected > 0n && (
                  <div
                    className="w-full max-w-12 rounded-t-[4px] bg-chart-1 transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
                    style={{ height: `${barPermille(w.collected, max) / 10}%`, minHeight: 2 }}
                  />
                )}
                {i === peak && (
                  <span
                    className={cn("tabular absolute bottom-full mb-1 text-xs font-medium whitespace-nowrap transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0", align(i))}
                    data-testid="overview-collected-peak"
                  >
                    {formatUsd(w.collected)}
                  </span>
                )}
                <span
                  role="presentation"
                  className={cn(
                    "pointer-events-none absolute bottom-full z-10 mb-1 rounded-lg border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
                    align(i),
                  )}
                >
                  <span className="tabular font-medium">{formatUsd(w.collected)}</span>
                  <span className="text-muted-foreground"> · {bookingsLabel(w.bookings)}</span>
                </span>
              </div>
              <span className="mt-1.5 truncate text-center text-[11px] text-muted-foreground">{shortDate(w.weekStart)}</span>
            </li>
          ))}
        </ol>
        <details className="mt-3 border-t pt-2" data-testid="overview-collected-table-toggle">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Show as a table</summary>
          <table className="mt-2 w-full text-sm" data-testid="overview-collected-table">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1 font-medium">
                  Week of
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Bookings
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Collected
                </th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.weekStart} className="border-t">
                  <td className="py-1">{shortDate(w.weekStart)}</td>
                  <td className="tabular py-1 text-right">{w.bookings}</td>
                  <td className="tabular py-1 text-right">{formatUsd(w.collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </section>
  );
}
