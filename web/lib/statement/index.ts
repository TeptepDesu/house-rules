// A payee's payout statement (owner or cleaner): what they were paid, what's held and why.
// Pure. The page at /statement/[token] renders it; lib/db/statements.ts loads the rows.
// Written for the payee, not the operator: hold reasons are theirs to act on or nothing internal.

export type StatementRow = {
  splitId: string;
  role: "owner" | "cleaner" | "manager";
  amountRaw: bigint;
  status: "pending" | "paid" | "retained" | "rejected";
  reason: string | null;
  propertyName: string | null;
  checkIn: string;
  checkOut: string;
  txHash: string | null;
};

export type StatementLine = {
  id: string;
  amountRaw: bigint;
  state: "paid" | "held" | "processing";
  reasonText: string;
  propertyName: string | null;
  checkIn: string;
  checkOut: string;
  /** Only a real on-chain tx. A rehearsal hash ("mock-…") is marked simulated instead. */
  txHash: string | null;
  simulated: boolean;
};

const PAYEE_REASONS: Record<string, string> = {
  OverCap: "Above your per-payout limit",
  SiblingRejected: "Held with the rest of this booking",
  PayeeInDelay: "Your account is in its new-payee waiting period",
  PayeeNotAllowed: "Your account isn't approved for payouts yet",
};

/** Failures the next run retries by itself: to the payee, the payout is still on its way. */
const RETRIED = new Set(["other", "BatchReverted", "SettleFailed", "RunStopped"]);

/** Why a payout is held, in the payee's words. Operational causes stay with the operator. */
export const heldReason = (code: string | null) => (code && PAYEE_REASONS[code]) || "Held for review by the operator";

/** rehearsal: the app runs on a simulated vault, so no paid line is a real payment (some have no tx at all). */
export function buildStatement(rows: StatementRow[], o: { rehearsal?: boolean } = {}): { lines: StatementLine[]; paidRaw: bigint; heldRaw: bigint } {
  const lines: StatementLine[] = [];
  let paidRaw = 0n;
  let heldRaw = 0n;
  for (const r of rows) {
    if (r.status === "retained") continue; // the operator's share stays in the vault
    const state = r.status === "paid" ? "paid" : r.status === "rejected" || (r.reason && !RETRIED.has(r.reason)) ? "held" : "processing";
    if (state === "paid") paidRaw += r.amountRaw;
    if (state === "held") heldRaw += r.amountRaw;
    const simulated = state === "paid" && (!!o.rehearsal || !!r.txHash?.startsWith("mock-"));
    lines.push({
      id: r.splitId,
      amountRaw: r.amountRaw,
      state,
      reasonText: state === "held" ? heldReason(r.reason) : "",
      propertyName: r.propertyName,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      txHash: state === "paid" && !simulated ? r.txHash : null,
      simulated,
    });
  }
  lines.sort((a, b) => b.checkOut.localeCompare(a.checkOut) || (a.propertyName ?? "").localeCompare(b.propertyName ?? ""));
  return { lines, paidRaw, heldRaw };
}
