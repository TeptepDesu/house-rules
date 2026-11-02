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
  runs: { id: string; status: string; paidTotalRaw: bigint; startedAt: Date; txs: unknown[] }[];
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
  const paid = i.runs.filter((r) => r.paidTotalRaw > 0n);
  return {
    collected: withMoney.reduce((a, b) => a + b.collected + b.penaltiesCollected, 0n),
    collectedBookings: withMoney.length,
    readyToPay: i.readyToPay,
    readyCount: i.readyCount,
    paidOut: paid.reduce((a, r) => a + r.paidTotalRaw, 0n),
    paidRuns: paid.length,
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
