import "server-only";
import { Account, JsonRpcProvider, KeyPair, actions } from "near-api-js";
import type { AgentVault } from "@/lib/agent/run";
import type { PayoutItem } from "@/lib/splits";
import { type TxOutcome, settleResult } from "./outcome";
import type { VaultPayee } from "./policy";

// Server-side vault access. Views go over plain JSON-RPC (no keys). settle() is signed with the
// agent's FUNCTION-CALL key; before the first payout we check on-chain that the key really is
// scoped to vault.settle and nothing else, and refuse to run otherwise (CLAUDE.md guardrail).

type RawPayee = { account_id: string; role: "owner" | "cleaner"; cap_per_payout: string; payable_from_ns: string; active: boolean };
export type VaultPolicy = {
  owner: string;
  agent: string;
  token: string;
  daily_limit: string;
  payee_delay_ns: string;
  max_batch: number;
  token_registered: boolean;
};

export class AgentKeyNotScopedError extends Error {
  constructor(detail: string) {
    super(`Refusing to run the agent: ${detail}. Use a function-call key limited to vault.settle.`);
    this.name = "AgentKeyNotScopedError";
  }
}

async function rpc<T>(url: string, method: string, params: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "hr", method, params }) });
  const body = (await res.json()) as { result?: T & { error?: string }; error?: { message?: string; data?: unknown } };
  if (body.error || !body.result || body.result.error) throw new Error(`RPC ${method} failed: ${JSON.stringify(body.error ?? body.result?.error)}`);
  return body.result;
}

export async function viewCall<T>(
  url: string,
  contract: string,
  method: string,
  args: object = {},
  finality: "final" | "optimistic" = "final", // final lags ~2 blocks; fine (conservative) for planning
): Promise<T> {
  const r = await rpc<{ result: number[] }>(url, "query", {
    request_type: "call_function",
    finality,
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(r.result).toString("utf8")) as T;
}

export function createVaultReader(rpcUrl: string, vault: string) {
  let policy: Promise<VaultPolicy> | undefined;
  const getPolicy = () => (policy ??= viewCall<VaultPolicy>(rpcUrl, vault, "get_policy"));
  return {
    getPolicy,
    async getPayees(): Promise<VaultPayee[]> {
      const raw = await viewCall<RawPayee[]>(rpcUrl, vault, "get_payees");
      return raw.map((p) => ({ accountId: p.account_id, role: p.role, capPerPayout: BigInt(p.cap_per_payout), payableFromNs: BigInt(p.payable_from_ns), active: p.active }));
    },
    /** One payee as the vault sees it (null if not on the allowlist). Optimistic: reads a just-signed add. */
    async getPayee(accountId: string): Promise<VaultPayee | null> {
      const p = await viewCall<RawPayee | null>(rpcUrl, vault, "get_payee", { account_id: accountId }, "optimistic");
      return p && { accountId: p.account_id, role: p.role, capPerPayout: BigInt(p.cap_per_payout), payableFromNs: BigInt(p.payable_from_ns), active: p.active };
    },
    async remainingToday() {
      return BigInt(await viewCall<string>(rpcUrl, vault, "remaining_today"));
    },
    async balance() {
      const { token } = await getPolicy();
      return BigInt(await viewCall<string>(rpcUrl, token, "ft_balance_of", { account_id: vault }));
    },
    async paidKeys(keys: string[]) {
      const flags = await Promise.all(keys.map((key) => viewCall<boolean>(rpcUrl, vault, "is_paid", { key })));
      return new Set(keys.filter((_, i) => flags[i]));
    },
  };
}

/** Throws unless `publicKey` on `account` is a function-call key for `vault` with methods exactly ["settle"]. */
export async function assertAgentKeyScoped(rpcUrl: string, account: string, publicKey: string, vault: string) {
  type AK = { permission: "FullAccess" | { FunctionCall: { receiver_id: string; method_names: string[] } } };
  let ak: AK;
  try {
    // optimistic = the state the chain validates transactions against (a just-added key counts)
    ak = await rpc<AK>(rpcUrl, "query", { request_type: "view_access_key", finality: "optimistic", account_id: account, public_key: publicKey });
  } catch (e) {
    throw new AgentKeyNotScopedError(`the agent key isn't registered on ${account} (${e instanceof Error ? e.message.slice(0, 160) : "lookup failed"})`);
  }
  if (ak.permission === "FullAccess") throw new AgentKeyNotScopedError("the agent key has FULL ACCESS");
  const fc = ak.permission.FunctionCall;
  if (fc.receiver_id !== vault) throw new AgentKeyNotScopedError(`the agent key is scoped to ${fc.receiver_id}, not the vault`);
  if (fc.method_names.length !== 1 || fc.method_names[0] !== "settle") throw new AgentKeyNotScopedError(`the agent key allows [${fc.method_names.join(", ") || "all methods"}]`);
}

/** Full AgentVault: reads + settle with the scoped agent key (verified once before first use). */
export function createAgentVault(o: { rpcUrl: string; vault: string; agentAccount: string; agentPrivateKey: string }): AgentVault {
  const reader = createVaultReader(o.rpcUrl, o.vault);
  const key = KeyPair.fromString(o.agentPrivateKey as `ed25519:${string}`);
  const account = new Account(o.agentAccount, new JsonRpcProvider({ url: o.rpcUrl }), o.agentPrivateKey as `ed25519:${string}`);
  let checked: Promise<void> | undefined;
  return {
    ...reader,
    async settle(items: PayoutItem[], gasTgas: number) {
      await (checked ??= assertAgentKeyScoped(o.rpcUrl, o.agentAccount, key.getPublicKey().toString(), o.vault));
      const tx = await account.signAndSendTransaction({
        receiverId: o.vault,
        actions: [
          actions.functionCall(
            "settle",
            { items: items.map((i) => ({ key: i.key, payee: i.payee, amount: i.amount.toString() })) },
            BigInt(gasTgas) * 10n ** 12n,
            0n,
          ),
        ],
        throwOnFailure: false, // policy panics come back as a Failure outcome we parse
      });
      return settleResult(tx as unknown as TxOutcome, o.vault);
    },
  };
}
