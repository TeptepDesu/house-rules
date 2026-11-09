// The one place statuses become a label + tone (design.md § Components). Screens never pick colours.

export type Tone = "success" | "warning" | "destructive" | "info" | "neutral";
type Entry = { label: string; tone: Tone };

const MAPS = {
  payee: {
    pending_signature: { label: "Needs signature", tone: "warning" },
    in_delay: { label: "In waiting period", tone: "warning" },
    active: { label: "Active", tone: "success" },
    removed: { label: "Removed", tone: "neutral" },
  },
  booking: {
    unreconciled: { label: "Not reconciled", tone: "info" },
    blocked: { label: "Blocked", tone: "destructive" },
    ready: { label: "Ready to pay", tone: "success" },
    settling: { label: "Paying out", tone: "warning" },
    settled: { label: "Paid out", tone: "success" },
  },
  invoice: {
    open: { label: "Open", tone: "info" },
    pending: { label: "Payment in progress", tone: "warning" },
    paid: { label: "Paid", tone: "success" },
    underpaid: { label: "Underpaid", tone: "destructive" },
    overpaid: { label: "Overpaid", tone: "warning" },
    expired: { label: "Expired", tone: "neutral" },
    refunded: { label: "Refunded", tone: "neutral" },
    waived: { label: "Waived", tone: "neutral" },
  },
  payment: {
    awaiting_deposit: { label: "Waiting for payment", tone: "info" },
    processing: { label: "Processing", tone: "warning" },
    incomplete_deposit: { label: "Incomplete payment", tone: "destructive" },
    delivered_unverified: { label: "Confirming", tone: "warning" },
    verified: { label: "Received", tone: "success" },
    refunded: { label: "Refunded", tone: "neutral" },
    expired: { label: "Expired", tone: "neutral" },
    failed: { label: "Failed", tone: "destructive" },
  },
  split: {
    pending: { label: "Pending", tone: "info" },
    paid: { label: "Paid", tone: "success" },
    retained: { label: "Kept in vault", tone: "neutral" },
    rejected: { label: "Rejected", tone: "destructive" },
  },
  statement: {
    paid: { label: "Paid", tone: "success" },
    held: { label: "Held", tone: "warning" },
    processing: { label: "Being paid", tone: "info" },
  },
  run: {
    running: { label: "Running", tone: "warning" },
    succeeded: { label: "Completed", tone: "success" },
    partial: { label: "Partly paid", tone: "warning" },
    held: { label: "Held back", tone: "warning" },
    failed: { label: "Failed", tone: "destructive" },
  },
  importRow: {
    new: { label: "Will import", tone: "success" },
    update: { label: "Adds payout", tone: "info" },
    duplicate: { label: "Already imported", tone: "neutral" },
    flagged: { label: "Needs attention", tone: "destructive" },
    ignored: { label: "Skipped", tone: "neutral" },
  },
  recon: {
    matched: { label: "Matched", tone: "success" },
    mismatch: { label: "Amount mismatch", tone: "destructive" },
    open_penalty: { label: "Open damage claim", tone: "destructive" },
    unpaid: { label: "Unpaid", tone: "destructive" },
    awaiting_payment: { label: "Waiting for payment", tone: "info" },
    orphan_payment: { label: "Unmatched payment", tone: "warning" },
  },
} as const satisfies Record<string, Record<string, Entry>>;

export type StatusKind = keyof typeof MAPS;

export function statusOf<K extends StatusKind>(kind: K, value: keyof (typeof MAPS)[K] & string): Entry {
  return (MAPS[kind] as Record<string, Entry>)[value] ?? { label: value, tone: "neutral" };
}

export const STATUS_MAPS = MAPS;
