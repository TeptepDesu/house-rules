import "server-only";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { db } from "./conn";
import { activityLog, vaultEvents } from "./schema";

// The audit feed: vault events (from the chain, each with its tx) + in-app actions, newest first.

export type AuditRow =
  | { kind: "chain"; id: string; at: Date; event: string; data: Record<string, unknown>; txHash: string; simulated: boolean }
  | { kind: "app"; id: string; at: Date; action: string; meta: Record<string, unknown> };

const NOISE = ["login"]; // sign-ins aren't business events

export async function listAuditFeed(userId: string, show: "all" | "chain" | "app" = "all", limit = 100): Promise<AuditRow[]> {
  const d = await db();
  const chain: AuditRow[] =
    show === "app"
      ? []
      : (await d.select().from(vaultEvents).where(eq(vaultEvents.userId, userId)).orderBy(desc(vaultEvents.createdAt), desc(vaultEvents.seq)).limit(limit)).map((e) => ({
          kind: "chain" as const,
          id: e.id,
          at: e.createdAt,
          event: e.event,
          data: e.dataJson as Record<string, unknown>,
          txHash: e.txHash,
          simulated: e.simulated,
        }));
  const app: AuditRow[] =
    show === "chain"
      ? []
      : (
          await d
            .select()
            .from(activityLog)
            .where(and(eq(activityLog.userId, userId), notInArray(activityLog.action, NOISE)))
            .orderBy(desc(activityLog.createdAt))
            .limit(limit)
        ).map((a) => ({ kind: "app" as const, id: a.id, at: a.createdAt, action: a.action, meta: (a.metaJson ?? {}) as Record<string, unknown> }));
  return [...chain, ...app].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
