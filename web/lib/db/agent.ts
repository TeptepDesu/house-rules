import "server-only";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import type { PropertyTerms, ReadyBooking } from "@/lib/agent/plan";
import type { RunOutcome } from "@/lib/agent/run";
import { listBookingsWithRecon } from "./bookings";
import { db } from "./conn";
import { agentRuns, bookings, payees, payoutSplits, properties, settlementTxs } from "./schema";

// Agent runs: what to pay (inputs), a per-operator run lock, and the full record of each run.

const LOCK_MS = 10 * 60 * 1000;

/** Ready bookings (live reconciliation) + the terms of their properties. */
export async function loadAgentInputs(userId: string, now = new Date()): Promise<{ ready: ReadyBooking[]; terms: PropertyTerms[] }> {
  const rows = (await listBookingsWithRecon(userId, now)).filter((r) => r.recon.settlementStatus === "ready" && r.settlementStatus !== "settled");
  const ready = rows.map((r) => ({
    id: r.id,
    propertyId: r.propertyId,
    collected: r.recon.collected,
    cleaningFeeOverride: r.cleaningFeeOverrideRaw,
    penalties: r.paidPenalties,
  }));
  const d = await db();
  const props = await d
    .select({ id: properties.id, cleaningFeeRaw: properties.cleaningFeeRaw, mgmtFeeBps: properties.mgmtFeeBps, ownerPayeeId: properties.ownerPayeeId, cleanerPayeeId: properties.cleanerPayeeId })
    .from(properties)
    .where(eq(properties.userId, userId));
  const ps = await d.select({ id: payees.id, nearAccount: payees.nearAccount, vaultStatus: payees.vaultStatus }).from(payees).where(eq(payees.userId, userId));
  const account = (id: string | null) => {
    const p = ps.find((x) => x.id === id);
    return p && p.vaultStatus !== "removed" ? p.nearAccount : null;
  };
  const terms = props.map((p) => ({ id: p.id, cleaningFeeRaw: p.cleaningFeeRaw, mgmtFeeBps: p.mgmtFeeBps, ownerAccount: account(p.ownerPayeeId), cleanerAccount: account(p.cleanerPayeeId) }));
  return { ready, terms };
}

/** Start a run unless one is already running for this operator (returns null if busy). */
export async function startRun(userId: string, trigger: "manual" | "cron"): Promise<string | null> {
  const d = await db();
  return d.transaction(async (tx) => {
    const busy = await tx
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(and(eq(agentRuns.userId, userId), eq(agentRuns.status, "running"), gt(agentRuns.startedAt, new Date(Date.now() - LOCK_MS))))
      .limit(1);
    if (busy.length) return null;
    const [r] = await tx.insert(agentRuns).values({ userId, trigger }).returning({ id: agentRuns.id });
    return r.id;
  });
}

export async function failRun(runId: string) {
  await (await db()).update(agentRuns).set({ status: "failed", finishedAt: new Date() }).where(eq(agentRuns.id, runId));
}

/** Record everything a run did, in one transaction. Split rows are upserted per (booking, role). */
export async function finishRun(userId: string, runId: string, out: RunOutcome, payeeIdsByAccount: Map<string, string>) {
  const d = await db();
  await d.transaction(async (tx) => {
    const txIdByHash = new Map<string, string>();
    for (const c of out.chunks) {
      const r = c.result;
      const hash = "txHash" in r ? r.txHash : null;
      const status = r.kind === "error" ? "failed" : r.kind;
      const [row] = await tx
        .insert(settlementTxs)
        .values({ agentRunId: runId, chunkIndex: c.index, txHash: hash || null, status, rejectionCode: r.kind === "rejected" ? r.code : r.kind === "error" ? r.error.kind : null, executedAt: new Date() })
        .returning({ id: settlementTxs.id });
      if (hash) txIdByHash.set(hash, row.id);
    }
    for (const b of out.bookings) {
      for (const it of b.items) {
        const values = {
          bookingId: b.bookingId,
          role: it.role,
          payeeId: payeeIdsByAccount.get(it.payee) ?? null,
          amountRaw: it.amount,
          vaultKey: it.key,
          settlementTxId: it.txHash ? (txIdByHash.get(it.txHash) ?? null) : null,
          status: it.status === "paid" ? ("paid" as const) : it.status === "rejected" ? ("rejected" as const) : ("pending" as const),
          reason: it.reason ?? null,
        };
        await tx
          .insert(payoutSplits)
          .values(values)
          .onConflictDoUpdate({
            target: [payoutSplits.bookingId, payoutSplits.role],
            set: { amountRaw: values.amountRaw, payeeId: values.payeeId, settlementTxId: values.settlementTxId, status: values.status, reason: values.reason },
          });
      }
      if (b.status === "paid") {
        await tx
          .insert(payoutSplits)
          .values({ bookingId: b.bookingId, role: "manager", amountRaw: b.retained, vaultKey: `${b.bookingId}:manager`, status: "retained" })
          .onConflictDoUpdate({ target: [payoutSplits.bookingId, payoutSplits.role], set: { amountRaw: b.retained, status: "retained" } });
      }
    }
    const paidIds = out.bookings.filter((b) => b.status === "paid").map((b) => b.bookingId);
    if (paidIds.length) await tx.update(bookings).set({ settlementStatus: "settled" }).where(and(eq(bookings.userId, userId), inArray(bookings.id, paidIds)));
    await tx
      .update(agentRuns)
      .set({ status: out.status, plannedTotalRaw: out.plannedTotal, paidTotalRaw: out.paidTotal, rejectedCount: out.rejectedCount, finishedAt: new Date() })
      .where(eq(agentRuns.id, runId));
  });
}

export async function listRuns(userId: string, limit = 20) {
  return (await db()).select().from(agentRuns).where(eq(agentRuns.userId, userId)).orderBy(desc(agentRuns.startedAt)).limit(limit);
}

/** Splits + tx for one run (only this operator's). */
export async function runDetail(userId: string, runId: string) {
  const d = await db();
  const [run] = await d.select().from(agentRuns).where(and(eq(agentRuns.id, runId), eq(agentRuns.userId, userId)));
  if (!run) return null;
  const txs = await d.select().from(settlementTxs).where(eq(settlementTxs.agentRunId, runId)).orderBy(settlementTxs.chunkIndex);
  const splits = txs.length
    ? await d
        .select({
          bookingId: payoutSplits.bookingId,
          role: payoutSplits.role,
          amountRaw: payoutSplits.amountRaw,
          status: payoutSplits.status,
          reason: payoutSplits.reason,
          settlementTxId: payoutSplits.settlementTxId,
          guestName: bookings.guestName,
          payeeName: payees.name,
          payeeAccount: payees.nearAccount,
        })
        .from(payoutSplits)
        .innerJoin(bookings, eq(bookings.id, payoutSplits.bookingId))
        .leftJoin(payees, eq(payees.id, payoutSplits.payeeId))
        .where(inArray(payoutSplits.settlementTxId, txs.map((t) => t.id)))
    : [];
  return { run, txs, splits };
}

/** Pending/rejected splits with their reasons (what the agent couldn't pay, and why). */
export async function unpaidSplits(userId: string) {
  return (await db())
    .select({
      bookingId: payoutSplits.bookingId,
      role: payoutSplits.role,
      amountRaw: payoutSplits.amountRaw,
      status: payoutSplits.status,
      reason: payoutSplits.reason,
      guestName: bookings.guestName,
      payeeName: payees.name,
      payeeAccount: payees.nearAccount,
    })
    .from(payoutSplits)
    .innerJoin(bookings, eq(bookings.id, payoutSplits.bookingId))
    .leftJoin(payees, eq(payees.id, payoutSplits.payeeId))
    .where(and(eq(bookings.userId, userId), inArray(payoutSplits.status, ["pending", "rejected"])));
}

/** Recent runs with their settlement txs, for the Payouts history. */
export async function listRunsWithTxs(userId: string, limit = 10) {
  const runs = await listRuns(userId, limit);
  if (runs.length === 0) return [];
  const txs = await (await db())
    .select()
    .from(settlementTxs)
    .where(inArray(settlementTxs.agentRunId, runs.map((r) => r.id)))
    .orderBy(settlementTxs.chunkIndex);
  return runs.map((r) => ({ ...r, txs: txs.filter((t) => t.agentRunId === r.id) }));
}
