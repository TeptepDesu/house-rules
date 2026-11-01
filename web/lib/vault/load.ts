import "server-only";
import { and, eq } from "drizzle-orm";
import { KeyPair } from "near-api-js";
import { agentMode } from "@/lib/agent/vault-factory";
import { db } from "@/lib/db/conn";
import { getVaultAccount } from "@/lib/db/invoices";
import { listPayees } from "@/lib/db/people";
import { payees as payeesTable } from "@/lib/db/schema";
import type { VaultPayee } from "@/lib/near/policy";
import { rpcUrl } from "@/lib/near/rpc";
import { assertAgentKeyScoped, createVaultReader } from "@/lib/near/vault";
import { payeeVaultStatus } from "./rules";

// What the Vault rules page shows. Live: read from the vault on-chain (and sync payee statuses
// into the app). Mock/rehearsal: the operator's app data, labelled as not on-chain yet.

const REHEARSAL_DAILY_LIMIT = 3_000n * 1_000_000n;
const REHEARSAL_DELAY_NS = 24n * 3_600n * 1_000_000_000n;

export type VaultView =
  | { state: "no_vault" }
  | { state: "unreachable"; vaultAccount: string; message: string }
  | {
      state: "ok";
      mode: "mock" | "live";
      vaultAccount: string;
      policy: { dailyLimit: bigint; payeeDelayNs: bigint; agent: string; owner: string; maxBatch: number; tokenRegistered: boolean };
      payees: VaultPayee[];
      names: Map<string, string>;
      remainingToday: bigint;
      balance: bigint | null;
      agentKey: { ok: boolean; detail: string };
      nowNs: bigint;
    };

export async function loadVaultView(userId: string): Promise<VaultView> {
  const vaultAccount = await getVaultAccount(userId);
  if (!vaultAccount) return { state: "no_vault" };
  const dbPayees = await listPayees(userId);
  const names = new Map(dbPayees.map((p) => [p.nearAccount, p.name]));
  const nowNs = BigInt(Date.now()) * 1_000_000n;

  if (agentMode() === "mock") {
    return {
      state: "ok",
      mode: "mock",
      vaultAccount,
      policy: { dailyLimit: REHEARSAL_DAILY_LIMIT, payeeDelayNs: REHEARSAL_DELAY_NS, agent: "simulated agent", owner: "you", maxBatch: 40, tokenRegistered: true },
      payees: dbPayees
        .filter((p) => p.vaultStatus !== "removed")
        .map((p) => ({ accountId: p.nearAccount, role: p.role, capPerPayout: p.capRaw, payableFromNs: 0n, active: true })),
      names,
      remainingToday: REHEARSAL_DAILY_LIMIT,
      balance: null,
      agentKey: { ok: true, detail: "Simulated in rehearsal mode" },
      nowNs,
    };
  }

  const url = rpcUrl();
  const reader = createVaultReader(url, vaultAccount);
  try {
    const [p, chainPayees, remainingToday, balance] = await Promise.all([reader.getPolicy(), reader.getPayees(), reader.remainingToday(), reader.balance()]);
    let agentKey = { ok: false, detail: "AGENT_ACCOUNT / AGENT_PRIVATE_KEY not configured on this server" };
    const acct = process.env.AGENT_ACCOUNT;
    const sk = process.env.AGENT_PRIVATE_KEY;
    if (acct && sk) {
      try {
        await assertAgentKeyScoped(url, acct, KeyPair.fromString(sk as `ed25519:${string}`).getPublicKey().toString(), vaultAccount);
        agentKey = { ok: true, detail: `${acct} holds a key that can only call settle on this vault` };
      } catch (e) {
        agentKey = { ok: false, detail: e instanceof Error ? e.message : "Agent key check failed" };
      }
    }
    await syncPayeeStatuses(userId, chainPayees, nowNs);
    return {
      state: "ok",
      mode: "live",
      vaultAccount,
      policy: {
        dailyLimit: BigInt(p.daily_limit),
        payeeDelayNs: BigInt(p.payee_delay_ns),
        agent: p.agent,
        owner: p.owner,
        maxBatch: p.max_batch,
        tokenRegistered: p.token_registered,
      },
      payees: chainPayees,
      names,
      remainingToday,
      balance,
      agentKey,
      nowNs,
    };
  } catch (e) {
    console.error("[vault.load] failed", e);
    return { state: "unreachable", vaultAccount, message: "Couldn't read your vault from NEAR right now." };
  }
}

/** Mirror the vault's view of each payee into the app (chain is the source of truth). */
async function syncPayeeStatuses(userId: string, chain: VaultPayee[], nowNs: bigint) {
  const d = await db();
  const byAccount = new Map(chain.map((p) => [p.accountId, p]));
  for (const p of await listPayees(userId)) {
    const status = payeeVaultStatus(byAccount.get(p.nearAccount), nowNs);
    if (status !== p.vaultStatus) {
      await d.update(payeesTable).set({ vaultStatus: status }).where(and(eq(payeesTable.id, p.id), eq(payeesTable.userId, userId)));
    }
  }
}
