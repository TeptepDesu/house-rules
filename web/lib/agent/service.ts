import "server-only";
import { logActivity } from "@/lib/db";
import { failRun, finishRun, loadAgentInputs, startRun } from "@/lib/db/agent";
import { listPayees } from "@/lib/db/people";
import { planBookingPayouts } from "./plan";
import { type AgentVault, type RunOutcome, runAgent } from "./run";

// One agent run for one operator: load → plan → run (vault) → record. Used by the Run-now action
// and /api/agent/run. Idempotent: the vault's paid keys + the DB's unique (booking, role) splits
// mean a repeated or overlapping run can never pay twice; the run lock avoids wasted work.

export type RunForUserResult = { ok: true; runId: string; outcome: RunOutcome } | { ok: false; error: "busy" | "failed"; message: string };

export async function runAgentForUser(userId: string, trigger: "manual" | "cron", vault: AgentVault, nowNs = () => BigInt(Date.now()) * 1_000_000n): Promise<RunForUserResult> {
  const runId = await startRun(userId, trigger);
  if (!runId) return { ok: false, error: "busy", message: "A payout run is already in progress." };
  try {
    const { ready, terms } = await loadAgentInputs(userId);
    const plans = planBookingPayouts(ready, terms);
    const outcome = await runAgent({ vault, nowNs }, plans);
    const payeeIds = new Map((await listPayees(userId)).map((p) => [p.nearAccount, p.id]));
    await finishRun(userId, runId, outcome, payeeIds);
    await logActivity({
      userId,
      action: "agent.run",
      entity: "agent_run",
      entityId: runId,
      meta: { trigger, status: outcome.status, paid: outcome.paidTotal.toString(), rejected: outcome.rejectedCount, stopped: outcome.stoppedBecause?.kind },
    });
    return { ok: true, runId, outcome };
  } catch (e) {
    console.error("[agent.run] failed", e);
    await failRun(runId);
    return { ok: false, error: "failed", message: "The payout run hit an error. Anything already paid on-chain is picked up by the next run; nothing is paid twice." };
  }
}
