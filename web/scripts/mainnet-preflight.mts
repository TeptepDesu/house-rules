// Mainnet preflight: everything we can check before spending anything. READ-ONLY. It loads no
// keys, signs nothing, and its only 1Click call is a `dry: true` quote (no deposit address, no money).
//
//   cd web && node scripts/mainnet-preflight.mts --account <you>.near \
//     [--vault <vault>.near] [--agent <agent>.near] [--payee <owner>.near --payee <cleaner>.near]
//
// Run it before the mainnet deploy (just --account and --payee), then again after it (all flags).
// Exit code 1 if anything blocking failed. `--network testnet --usdc <mock-ft>` runs the same NEAR
// checks against testnet (1Click is skipped there: it has no testnet).

import { existsSync, statSync } from "node:fs";
import { parseArgs } from "node:util";

const MAINNET_USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"; // native USDC (docs/notes.md)
const BASE_USDC = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
const ONECLICK = "https://1click.chaindefuser.com";
const YOCTO = 10n ** 24n;
const BYTE_COST = 10n ** 19n; // yoctoNEAR per byte of storage
const VAULT_WASM = new URL("../../contracts/target/near/vault/vault.wasm", import.meta.url);

const { values: o } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"), // pnpm passes its own `--` through
  options: {
    account: { type: "string" },
    vault: { type: "string" },
    agent: { type: "string" },
    payee: { type: "string", multiple: true, default: [] },
    network: { type: "string", default: "mainnet" },
    usdc: { type: "string" },
  },
});
if (!o.account) {
  console.error("Usage: node scripts/mainnet-preflight.mts --account <you>.near [--vault v.near] [--agent a.near] [--payee p.near ...]");
  process.exit(2);
}
const network = o.network === "testnet" ? "testnet" : "mainnet";
const usdc = o.usdc ?? (network === "mainnet" ? MAINNET_USDC : undefined);
if (!usdc) throw new Error("On testnet, pass --usdc <mock token account>.");
const RPC = process.env.NEAR_RPC_URL || `https://rpc.${network}.near.org`;

// ---- output ---------------------------------------------------------------------------------
let blocking = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const warn = (msg: string) => console.log(`  ! ${msg}`);
const fail = (msg: string) => (blocking++, console.log(`  ✗ ${msg}`));
const section = (t: string) => console.log(`\n${t}`);
const near = (yocto: bigint) => `${(Number(yocto / 10n ** 21n) / 1000).toFixed(3)} NEAR`; // display only
const usd = (raw: bigint) => `$${(raw / 1_000_000n).toLocaleString("en-US")}.${(raw % 1_000_000n).toString().padStart(6, "0").slice(0, 2)}`;

// ---- NEAR JSON-RPC (views only) ---------------------------------------------------------------
async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "preflight", method, params }) });
  const body = (await res.json()) as { result?: T & { error?: string }; error?: { cause?: { name?: string }; message?: string } };
  if (body.error || !body.result || body.result.error) {
    const e = new Error(body.error?.cause?.name ?? body.result?.error ?? body.error?.message ?? "RPC error");
    throw e;
  }
  return body.result;
}
const query = <T,>(params: object) => rpc<T>("query", { finality: "final", ...params });
type ViewAccount = { amount: string; locked: string; code_hash: string; storage_usage: number };
async function account(id: string): Promise<ViewAccount | null> {
  try {
    return await query<ViewAccount>({ request_type: "view_account", account_id: id });
  } catch (e) {
    if (e instanceof Error && /UNKNOWN_ACCOUNT/.test(e.message)) return null;
    throw e;
  }
}
async function view<T>(contract: string, method: string, args: object = {}): Promise<T> {
  const r = await query<{ result: number[] }>({ request_type: "call_function", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") });
  return JSON.parse(Buffer.from(r.result).toString("utf8")) as T;
}
const registered = async (id: string) => (await view<{ total: string } | null>(usdc, "storage_balance_of", { account_id: id })) !== null;
const NO_CODE = "11111111111111111111111111111111";

// ---- checks ---------------------------------------------------------------------------------
console.log(`House Rules preflight · ${network} · ${RPC} · read-only`);

section("Network");
const status = await rpc<{ chain_id: string }>("status", []);
if (status.chain_id === network) ok(`RPC is on ${status.chain_id}`);
else fail(`RPC reports chain "${status.chain_id}", expected ${network}`);

section("USDC token");
const meta = await view<{ symbol: string; decimals: number }>(usdc, "ft_metadata").catch(() => null);
if (!meta) fail(`${usdc} doesn't answer ft_metadata`);
else if (meta.decimals !== 6) fail(`${meta.symbol} has ${meta.decimals} decimals; the app assumes 6`);
else ok(`${meta.symbol} at ${usdc.length > 24 ? `${usdc.slice(0, 8)}…` : usdc}, 6 decimals`);
const bounds = await view<{ min: string }>(usdc, "storage_balance_bounds").catch(() => null);
if (bounds) ok(`registering an account on USDC costs ${near(BigInt(bounds.min))} (one storage_deposit)`);

section(`Operator account ${o.account}`);
const me = await account(o.account);
if (!me) fail("doesn't exist on this network");
else {
  const available = BigInt(me.amount) - BigInt(me.storage_usage) * BYTE_COST;
  const wasmBytes = existsSync(VAULT_WASM) ? BigInt(statSync(VAULT_WASM).size) : null;
  // vault account: contract storage + state + USDC registration + gas; 1 NEAR margin
  const vaultNeeds = wasmBytes ? wasmBytes * BYTE_COST + YOCTO : null;
  if (available >= YOCTO) ok(`${near(available)} available`);
  else fail(`only ${near(available)} available; fund it with about 1 NEAR for gas and storage, plus the vault's share`);
  if (vaultNeeds && !o.vault) {
    const line = `deploying the vault (${(Number(wasmBytes) / 1024).toFixed(0)} KB wasm) needs about ${near(vaultNeeds)} on the vault account`;
    if (available >= vaultNeeds + YOCTO) ok(line);
    else warn(`${line}; you have ${near(available)}`);
  }
  if (await registered(o.account)) ok("registered on USDC (can receive withdrawals)");
  else warn("not registered on USDC: needed before you can withdraw from the vault to this account");
}

if (o.payee.length) section("Payees");
for (const p of o.payee) {
  const a = await account(p);
  if (!a) {
    fail(`${p} doesn't exist`);
    continue;
  }
  if (await registered(p)) ok(`${p} exists and is registered on USDC`);
  else fail(`${p} isn't registered on USDC: a payout to it would revert the whole batch. Fix: storage_deposit on ${usdc} for ${p}`);
}

if (o.vault) {
  section(`Vault ${o.vault}`);
  const v = await account(o.vault);
  if (!v) fail("doesn't exist yet");
  else if (v.code_hash === NO_CODE) fail("exists but has no contract deployed");
  else {
    const policy = await view<{ owner: string; agent: string; token: string; daily_limit: string; token_registered: boolean }>(o.vault, "get_policy").catch(() => null);
    if (!policy) fail("has code, but get_policy fails: is this the House Rules vault?");
    else {
      if (policy.token === usdc) ok("pays in USDC");
      else fail(`token is ${policy.token}, not USDC (${usdc})`);
      if (policy.owner === o.account) ok(`owner is ${o.account}`);
      else warn(`owner is ${policy.owner}, not ${o.account}`);
      if (o.agent) {
        if (policy.agent === o.agent) ok(`agent is ${o.agent}`);
        else fail(`agent is ${policy.agent}, not ${o.agent}`);
      }
      ok(`daily limit ${usd(BigInt(policy.daily_limit))}`);
      // 1Click deliveries fail if the vault isn't registered on the token (docs/notes.md, finding 3)
      if ((await registered(o.vault)) && policy.token_registered) ok("registered on USDC: guest payments can land");
      else fail("NOT registered on USDC: 1Click deliveries to it would fail");
      ok(`balance ${usd(BigInt(await view<string>(usdc, "ft_balance_of", { account_id: o.vault })))}`);
      const payees = await view<{ account_id: string; active: boolean }[]>(o.vault, "get_payees").catch(() => []);
      ok(`${payees.length} payee(s) on the allowlist, ${payees.filter((x) => x.active).length} active`);
    }
  }
}

if (o.agent) {
  section(`Agent ${o.agent}`);
  type Key = { public_key: string; access_key: { permission: "FullAccess" | { FunctionCall: { receiver_id: string; method_names: string[] } } } };
  const a = await account(o.agent);
  if (!a) fail("doesn't exist");
  else {
    const { keys } = await query<{ keys: Key[] }>({ request_type: "view_access_key_list", account_id: o.agent });
    const scoped = keys.filter((k) => {
      const p = k.access_key.permission;
      return p !== "FullAccess" && p.FunctionCall.receiver_id === o.vault && p.FunctionCall.method_names.length === 1 && p.FunctionCall.method_names[0] === "settle";
    });
    if (!o.vault) warn("pass --vault to check the agent's settle-only key");
    else if (scoped.length) ok(`${scoped.length} function-call key(s) limited to ${o.vault}.settle (the app's AGENT_PRIVATE_KEY must be one of these)`);
    else fail(`no key limited to ${o.vault}.settle yet: create one before setting AGENT_PRIVATE_KEY`);
    const full = keys.filter((k) => k.access_key.permission === "FullAccess").length;
    if (full) warn(`${full} full-access key(s) exist on the agent account: fine for its owner, but never put one in the app's env`);
  }
}

section("NEAR Intents 1Click");
if (network !== "mainnet") warn("skipped: 1Click has no testnet");
else {
  try {
    const tokens = (await fetch(`${ONECLICK}/v0/tokens`).then((r) => r.json())) as { assetId: string }[];
    const has = (id: string) => tokens.some((t) => t.assetId === id);
    if (has(`nep141:${usdc}`)) ok(`tokens list has USDC on NEAR (${tokens.length} tokens)`);
    else fail("tokens list doesn't include USDC on NEAR");
    if (!has(BASE_USDC)) warn("tokens list doesn't include USDC on Base (the demo's guest origin)");

    const recipient = o.vault ?? o.account;
    const res = await fetch(`${ONECLICK}/v0/quote`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        dry: true, // never a deposit address, never money
        swapType: "EXACT_OUTPUT",
        slippageTolerance: 100,
        originAsset: BASE_USDC,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: `nep141:${usdc}`,
        amount: "1000000",
        refundTo: "0x0000000000000000000000000000000000000001",
        refundType: "ORIGIN_CHAIN",
        recipient,
        recipientType: "DESTINATION_CHAIN",
        deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
      }),
    });
    const q = (await res.json().catch(() => null)) as { quote?: { amountIn: string; timeEstimate: number; depositAddress?: string }; message?: string } | null;
    if (!res.ok || !q?.quote) fail(`dry quote refused (${res.status}): ${q?.message ?? "no body"}`);
    else if (q.quote.depositAddress) fail("dry quote returned a deposit address; refusing to trust it");
    else ok(`dry quote: $1.00 to ${recipient} costs ${usd(BigInt(q.quote.amountIn))} USDC from Base, ~${q.quote.timeEstimate}s`);

    const s = await fetch(`${ONECLICK}/v0/status?depositAddress=preflight-check-not-a-deposit`);
    ok(`status endpoint answers (HTTP ${s.status} for an unknown address)`);
  } catch (e) {
    fail(`1Click unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log(blocking ? `\n${blocking} blocking issue(s). Fix them before deploying or spending.` : "\nNothing blocking.");
process.exit(blocking ? 1 : 0);
