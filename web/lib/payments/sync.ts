import "server-only";
import { applyPaymentUpdate, getVaultAccount, paymentsToSync } from "@/lib/db/invoices";
import { paymentDeps } from "./deps";
import { type PaymentDeps, pollPayment } from "./service";

// The server checks payments itself. The guest's pay page polls too, but a guest who pays and closes
// the tab must still end up marked as paid, and a waive must act on what's true now, not on the
// last thing a browser happened to ask.

const FORGET_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PER_SYNC = 20;

export async function syncPayments(userId: string, o: { publicId?: string; deps?: (vaultAccount: string) => PaymentDeps } = {}) {
  const deps = (o.deps ?? paymentDeps)((await getVaultAccount(userId)) ?? "");
  const rows = await paymentsToSync(userId, { publicId: o.publicId, deadlineAfter: new Date(deps.now().getTime() - FORGET_AFTER_MS), limit: MAX_PER_SYNC });
  let failed = 0;
  for (const p of rows) {
    try {
      const r = await pollPayment(deps, { depositAddress: p.depositAddress, depositMemo: p.depositMemo, deadline: p.deadline, invoiceAmount: p.invoiceAmount });
      await applyPaymentUpdate(p.invoiceId, p.id, r);
    } catch (e) {
      failed++;
      console.error("[payments.sync] check failed", p.id, e);
    }
  }
  return { checked: rows.length, failed };
}

/** For page loads and payout runs: a failed check is logged, and the last known status stands. */
export async function syncPaymentsQuietly(userId: string): Promise<void> {
  try {
    await syncPayments(userId);
  } catch (e) {
    console.error("[payments.sync] failed", e);
  }
}
