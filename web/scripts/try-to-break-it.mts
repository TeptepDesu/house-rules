// Demo shot 5, "try to break it": act as someone who stole the agent's key and try to drain the
// vault. Every attempt is signed with the agent's settle-only function-call key (the same key the
// app's agent uses), and every one is refused by NEAR or by the vault's rules. Balances are read
// before and after to show nothing moved.
//
//   cd web && node --env-file=.env.testnet.local scripts/try-to-break-it.mts [vault-account]
//
// TESTNET ONLY. Failed attempts still cost the agent key a little testnet gas. Never prints the key.

import { Account, JsonRpcProvider, actions } from "near-api-js";

const network = process.env.NEAR_NETWORK;
if (network !== "testnet") throw new Error(`Refusing to run: NEAR_NETWORK is "${network ?? "unset"}", this script is testnet only.`);
const agent = process.env.AGENT_ACCOUNT;
const secret = process.env.AGENT_PRIVATE_KEY;
if (!agent || !secret) throw new Error("Set AGENT_ACCOUNT and AGENT_PRIVATE_KEY (web/.env.testnet.local).");

const VAULT = process.argv[2] ?? "vault.houserules-operator.testnet";
const RPC = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";
const THIEF = "thief.testnet"; // not on the vault's list
const USD = 1_000_000n;
const TGAS = 10n ** 12n;

const provider = new JsonRpcProvider({ url: RPC });
const account = new Account(agent, provider, secret as `ed25519:${string}`);

async function view<T>(contract: string, method: string, args: object): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: { request_type: "call_function", finality: "optimistic", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") },
    }),
  }).then((r) => r.json());
  if (res.error || res.result?.error) throw new Error(`view ${contract}.${method} failed: ${JSON.stringify(res.error ?? res.result.error).slice(0, 200)}`);
  return JSON.parse(Buffer.from(res.result.result).toString()) as T;
}
const usd = (raw: bigint) => `$${(raw / USD).toLocaleString("en-US")}.${(raw % USD).toString().padStart(6, "0").slice(0, 2)}`;

const policy = await view<{ owner: string; agent: string; token: string; daily_limit: string }>(VAULT, "get_policy", {});
if (policy.agent !== agent) throw new Error(`${agent} isn't this vault's agent (${policy.agent}).`);
const payees = await view<{ account_id: string; role: string; cap_per_payout: string; active: boolean }[]>(VAULT, "get_payees", {});
const victim = payees.find((p) => p.active && p.role === "cleaner") ?? payees.find((p) => p.active);
if (!victim) throw new Error("The vault has no active payee to test the cap with.");
const paidKey = (await view<boolean>(VAULT, "is_paid", { key: "demo-bk1:owner" })) ? "demo-bk1:owner" : null;
const balance = () => view<string>(policy.token, "ft_balance_of", { account_id: VAULT }).then(BigInt);

type Attempt = { label: string; method: string; args: object };
const tag = `break-${Date.now()}`;
const attempts: Attempt[] = [
  { label: `Pay a stranger (${THIEF}) $500`, method: "settle", args: { items: [{ key: `${tag}:a`, payee: THIEF, amount: (500n * USD).toString() }] } },
  {
    label: `Pay ${victim.account_id} one cent over their ${usd(BigInt(victim.cap_per_payout))} limit`,
    method: "settle",
    args: { items: [{ key: `${tag}:b`, payee: victim.account_id, amount: (BigInt(victim.cap_per_payout) + 10_000n).toString() }] },
  },
  ...(paidKey
    ? [{ label: `Pay booking "${paidKey}" a second time`, method: "settle", args: { items: [{ key: paidKey, payee: payees.find((p) => p.role === "owner")?.account_id ?? victim.account_id, amount: (7n * USD).toString() }] } }]
    : []),
  { label: `Withdraw the vault's USDC to ${THIEF}`, method: "withdraw", args: { amount: (100n * USD).toString(), receiver_id: THIEF } },
  { label: `Add ${THIEF} as an approved payee`, method: "add_payee", args: { account_id: THIEF, role: "owner", cap_per_payout: (1_000n * USD).toString() } },
];

function explain(text: string): { who: string; why: string } {
  const policy = /POLICY_REJECTED:([A-Za-z]+)/.exec(text)?.[1];
  if (policy) return { who: "the vault's rules", why: policy };
  if (/MethodNameMismatch|method_name|method name/i.test(text)) return { who: "NEAR itself", why: "this key can only call settle" };
  if (/ReceiverMismatch/i.test(text)) return { who: "NEAR itself", why: "this key can only call the vault" };
  return { who: "unknown", why: text.slice(0, 160) };
}

const before = await balance();
console.log(`\nVault ${VAULT} holds ${usd(before)} USDC. Signing as ${agent} with its settle-only key.\n`);

let allRefused = true;
for (const [i, a] of attempts.entries()) {
  let line: string;
  try {
    const tx = await account.signAndSendTransaction({
      receiverId: VAULT,
      actions: [actions.functionCall(a.method, a.args, 100n * TGAS, 0n)],
      throwOnFailure: false,
    });
    const st = (tx as { status: unknown; transaction: { hash: string } }).status;
    if (st && typeof st === "object" && "Failure" in st) {
      const { who, why } = explain(JSON.stringify(st));
      line = `REFUSED by ${who}: ${why}   (tx ${(tx as { transaction: { hash: string } }).transaction.hash})`;
    } else {
      allRefused = false;
      line = `!! NOT REFUSED (status ${JSON.stringify(st).slice(0, 80)})`;
    }
  } catch (e) {
    const { who, why } = explain(`${(e as Error).name} ${(e as Error).message}`);
    line = `REFUSED by ${who}: ${why}`;
  }
  console.log(`${i + 1}. ${a.label}\n   → ${line}\n`);
}

const after = await balance();
console.log(`Vault still holds ${usd(after)} USDC: ${after === before ? "nothing moved." : `!! changed by ${usd(before - after)}`}\n`);
if (!allRefused || after !== before) process.exit(1);
