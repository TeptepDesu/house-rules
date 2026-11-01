import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { isNotNull } from "drizzle-orm";
import { runAgentForUser } from "@/lib/agent/service";
import { agentVaultFor } from "@/lib/agent/vault-factory";
import { getSessionUserId } from "@/lib/auth/session";
import { db } from "@/lib/db/conn";
import { users } from "@/lib/db/schema";

// POST /api/agent/run (CLAUDE.md route rule 6): an operator session runs their own payouts; the
// scheduler (GitHub Actions) sends `x-agent-secret: $AGENT_RUN_SECRET` to run every operator with a
// vault. Anything else is 401. Runs are idempotent (vault paid keys + run lock), so retries are safe.

function schedulerAuthorized(req: NextRequest): boolean {
  const expected = process.env.AGENT_RUN_SECRET;
  const got = req.headers.get("x-agent-secret");
  if (!expected || expected.length < 32 || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function runFor(userId: string, trigger: "manual" | "cron") {
  const setup = await agentVaultFor(userId);
  if (!setup.ok) return { userId, ok: false, reason: setup.reason };
  const r = await runAgentForUser(userId, trigger, setup.vault);
  return r.ok
    ? { userId, ok: true, runId: r.runId, status: r.outcome.status, paid: r.outcome.paidTotal.toString(), held: r.outcome.rejectedCount }
    : { userId, ok: false, reason: r.error };
}

export async function POST(req: NextRequest) {
  try {
    if (schedulerAuthorized(req)) {
      const operators = await (await db()).select({ id: users.id }).from(users).where(isNotNull(users.vaultAccount));
      const results = [];
      for (const o of operators) results.push(await runFor(o.id, "cron"));
      return Response.json({ runs: results });
    }
    const userId = await getSessionUserId();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json(await runFor(userId, "manual"));
  } catch (e) {
    console.error("[api.agent.run] failed", e);
    return Response.json({ error: "Run failed" }, { status: 500 });
  }
}
