// Overview dashboard (plan §7 core 7): headline numbers and what needs the operator's attention.
// Pure: the page feeds it data the other screens already load.

import { reasonLabel } from "@/lib/agent/labels";
import { formatUsd } from "@/lib/money";
import { longDate } from "@/lib/ui/format";

export type OverviewInput = {
  bookings: {
    id: string;
    guestName: string;
    propertyName: string;
    settlementStatus: "unreconciled" | "blocked" | "ready" | "settling" | "settled";
    /** Revenue collected for the booking, and paid penalties (both from reconciliation). */
    collected: bigint;
    penaltiesCollected: bigint;
    note: string;
  }[];
  invoices: { publicId: string; status: string; type: string; amountRaw: bigint; dueDate: string; guestName: string | null; description: string }[];
  /** Payouts the agent couldn't make (pending/rejected splits). */
  held: { bookingId: string; role: string; amountRaw: bigint; reason: string | null; guestName: string; payeeName: string | null }[];
  /** Every run's paid total, all time (from the database, not a recent-runs list). */
  paidTotals: { total: bigint; runs: number };
  /** From the payout plan (same numbers as the Payouts page). */
  readyToPay: bigint;
  readyCount: number;
  /** YYYY-MM-DD, for "overdue". */
  today: string;
};

const OPEN = new Set(["open", "pending", "expired"]);
const isOverdue = (i: OverviewInput["invoices"][number], today: string) => OPEN.has(i.status) && i.dueDate < today;
const isShort = (i: OverviewInput["invoices"][number]) => i.status === "underpaid";

export function overviewMetrics(i: OverviewInput) {
  const withMoney = i.bookings.filter((b) => b.collected + b.penaltiesCollected > 0n);
  return {
    collected: withMoney.reduce((a, b) => a + b.collected + b.penaltiesCollected, 0n),
    collectedBookings: withMoney.length,
    readyToPay: i.readyToPay,
    readyCount: i.readyCount,
    paidOut: i.paidTotals.total,
    paidRuns: i.paidTotals.runs,
    attention:
      i.bookings.filter((b) => b.settlementStatus === "blocked").length +
      i.held.length +
      i.invoices.filter((x) => isOverdue(x, i.today) || isShort(x)).length,
  };
}

export type AttentionItem = { key: string; kind: "booking" | "payout" | "invoice"; title: string; detail: string; href: string };

/** Most urgent first: blocked bookings (money stuck), held payouts, then invoice problems. */
export function attentionItems(i: OverviewInput, limit = 6): AttentionItem[] {
  const out: AttentionItem[] = [
    ...i.bookings
      .filter((b) => b.settlementStatus === "blocked")
      .map((b): AttentionItem => ({ key: `booking-${b.id}`, kind: "booking", title: `${b.guestName} · ${b.propertyName}`, detail: b.note, href: "/bookings" })),
    ...i.held.map(
      (h): AttentionItem => ({
        key: `held-${h.bookingId}-${h.role}`,
        kind: "payout",
        title: `${h.payeeName ?? "Payee"} for ${h.guestName}`,
        detail: `${reasonLabel(h.reason) || "Not paid yet"} · ${formatUsd(h.amountRaw)}`,
        href: "/payouts",
      }),
    ),
    ...i.invoices
      .filter((x) => isOverdue(x, i.today) || isShort(x))
      .map(
        (x): AttentionItem => ({
          key: `invoice-${x.publicId}`,
          kind: "invoice",
          title: `${x.guestName ?? "Guest"} · ${x.description}`,
          detail: `${isShort(x) ? "Paid less than invoiced" : `Overdue since ${longDate(x.dueDate)}`} · ${formatUsd(x.amountRaw)}`,
          href: "/invoices",
        }),
      ),
  ];
  return out.slice(0, limit);
}

export type WeekCollected = { weekStart: string; collected: bigint; bookings: number };

const DAY_MS = 86_400_000;
const mondayOf = (isoDate: string): number => {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  return t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS;
};
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Money collected per week of check-in, Monday first. The window ends at the latest week with
 * money (not today), so a quiet month doesn't empty the chart, and starts at the first week with
 * money inside it. Quiet weeks in between stay in, as zeros.
 */
export function weeklyCollected(rows: { checkIn: string; collected: bigint; penaltiesCollected: bigint }[], maxWeeks = 8): WeekCollected[] {
  const weeks = new Map<number, { collected: bigint; bookings: number }>();
  for (const r of rows) {
    const amount = r.collected + r.penaltiesCollected;
    if (amount <= 0n) continue;
    const w = weeks.get(mondayOf(r.checkIn)) ?? { collected: 0n, bookings: 0 };
    weeks.set(mondayOf(r.checkIn), { collected: w.collected + amount, bookings: w.bookings + 1 });
  }
  if (weeks.size === 0) return [];
  const latest = Math.max(...weeks.keys());
  const windowStart = latest - (maxWeeks - 1) * 7 * DAY_MS;
  const first = Math.min(...[...weeks.keys()].filter((t) => t >= windowStart));
  const out: WeekCollected[] = [];
  for (let t = first; t <= latest; t += 7 * DAY_MS) {
    const w = weeks.get(t);
    out.push({ weekStart: isoDay(t), collected: w?.collected ?? 0n, bookings: w?.bookings ?? 0 });
  }
  return out;
}

/** A bar's height in thousandths of the tallest one. Integer maths: amounts never become floats. */
export function barPermille(value: bigint, max: bigint): number {
  return max > 0n ? Number((value * 1000n) / max) : 0;
}
