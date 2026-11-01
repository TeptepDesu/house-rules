// Spike #3: a function-call access key on `agent`, scoped to vault.settle, driven from near-api-js.
// Proves what the key CAN do (settle) and everything it CAN'T, and records the exact error
// shapes lib/near will have to parse.
//
// Run:  node spike.ts <path-to-near-sandbox-binary> <scratch-home-dir>
// Needs the wasm from ../batch-payout (cargo near build in mock-ft/ and payer/).

import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Account, JsonRpcProvider, KeyPair, actions, nearToYocto, teraToGas } from "near-api-js";

const [bin, home] = process.argv.slice(2);
if (!bin || !home) throw new Error("usage: node spike.ts <near-sandbox-bin> <home-dir>");

const PORT = 3131;
const RPC = `http://127.0.0.1:${PORT}`;
const WASM = new URL("../batch-payout/target/near/", import.meta.url).pathname;
const CAP = 800_000_000n;

// ---------- sandbox ----------
rmSync(home, { recursive: true, force: true });
execFileSync(bin, ["--home", home, "init"], { stdio: "ignore" });
const cfgPath = `${home}/config.json`;
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
cfg.rpc.addr = `127.0.0.1:${PORT}`;
cfg.network.addr = "127.0.0.1:24599";
writeFileSync(cfgPath, JSON.stringify(cfg));
const node = spawn(bin, ["--home", home, "run"], { stdio: "ignore" });
process.on("exit", () => node.kill());

const provider = new JsonRpcProvider({ url: RPC });
for (let i = 0; ; i++) {
  try {
    const s = await fetch(`${RPC}/status`).then((r) => r.json());
    if (s.sync_info?.latest_block_height > 1) break;
  } catch {}
  if (i > 120) throw new Error("sandbox did not start");
  await new Promise((r) => setTimeout(r, 250));
}

const vk = JSON.parse(readFileSync(`${home}/validator_key.json`, "utf8"));
const rootKey = KeyPair.fromString(vk.secret_key);
const root = new Account(vk.account_id, provider, vk.secret_key);

async function makeAccount(id: string, key: KeyPair, wasm?: string, init?: { method: string; args: object; deposit?: bigint }) {
  const acts = [actions.createAccount(), actions.transfer(nearToYocto("50")), actions.addFullAccessKey(key.getPublicKey())];
  if (wasm) acts.push(actions.deployContract(readFileSync(`${WASM}${wasm}`)));
  if (init) acts.push(actions.functionCall(init.method, init.args, teraToGas("100"), init.deposit ?? 0n));
  await root.signAndSendTransaction({ receiverId: id, actions: acts });
}

const usdc = "usdc.test.near";
const vault = "vault.test.near";
const agentId = "agent.test.near";

await makeAccount(usdc, rootKey, "mock_ft/mock_ft.wasm", { method: "new", args: {} });
await makeAccount(vault, rootKey, "payer/payer.wasm", {
  method: "new",
  args: { token: usdc, cap: CAP.toString() },
  deposit: nearToYocto("0.01"),
});
const agentFull = KeyPair.fromRandom("ed25519"); // operator keeps this offline in real life
await makeAccount(agentId, agentFull);

const tester = new Account(usdc, provider, vk.secret_key); // usdc account = mint authority in the mock
await tester.callFunction({ contractId: usdc, methodName: "mint", args: { account_id: vault, amount: "1000000000" } });
await tester.callFunction({ contractId: usdc, methodName: "register_many", args: { account_ids: ["owner1.test.near"] } });

// ---------- add the scoped key ----------
const fcKey = KeyPair.fromRandom("ed25519");
const ALLOWANCE = nearToYocto("1");
await new Account(agentId, provider, agentFull.toString() as any).addFunctionCallAccessKey({
  publicKey: fcKey.getPublicKey(),
  contractId: vault,
  methodNames: ["settle"],
  allowance: ALLOWANCE,
});
// This is all the server would ever hold:
const agent = new Account(agentId, provider, fcKey.toString() as any);

const ak = await agent.getAccessKey(fcKey.getPublicKey());
console.log("\n[key] permission:", JSON.stringify(ak.permission));

// ---------- harness ----------
type Row = { case: string; expect: string; ok: boolean; got: string };
const rows: Row[] = [];
const balance = async (who: string) =>
  BigInt(await provider.callFunction({ contractId: usdc, method: "ft_balance_of", args: { account_id: who } }) as string);

function describe(e: unknown): string {
  const err = e as any;
  const name = err?.constructor?.name ?? typeof e;
  const msg = String(err?.message ?? e).replace(/\s+/g, " ").slice(0, 220);
  return `${name}: ${msg}`;
}

async function expectReject(label: string, fn: () => Promise<unknown>, match: RegExp) {
  try {
    const r = await fn();
    rows.push({ case: label, expect: "rejected", ok: false, got: `NOT rejected → ${JSON.stringify(r)?.slice(0, 120)}` });
  } catch (e) {
    const d = describe(e);
    rows.push({ case: label, expect: `rejected (${match})`, ok: match.test(d), got: d });
  }
}

const item = (key: string, payee: string, amount: bigint) => ({ key, payee, amount: amount.toString() });
const settle = (items: object[], deposit = 0n) =>
  agent.callFunction({ contractId: vault, methodName: "settle", args: { items }, gas: teraToGas("300"), deposit });

// 1. the one thing it may do
{
  const before = await balance("owner1.test.near");
  const r = await settle([item("b1:owner", "owner1.test.near", 300_000_000n)]);
  const after = await balance("owner1.test.near");
  rows.push({ case: "settle within policy", expect: "succeeds, owner paid", ok: r === true && after - before === 300_000_000n, got: `return=${r}, owner +${after - before}` });
}

// 2–7. everything it may not do
await expectReject("call another vault method (get_spent) via tx", () =>
  agent.callFunction({ contractId: vault, methodName: "get_spent", args: {} }), /MethodNameMismatch|method/i);
await expectReject("call the token directly (ft_transfer)", () =>
  agent.callFunction({ contractId: usdc, methodName: "ft_transfer", args: { receiver_id: agentId, amount: "1" } }), /ReceiverMismatch|receiver/i);
await expectReject("settle with 1 yocto attached", () => settle([item("b2:owner", "owner1.test.near", 1n)], 1n), /Deposit/i);
await expectReject("transfer NEAR out of agent", () =>
  agent.signAndSendTransaction({ receiverId: "owner1.test.near", actions: [actions.transfer(1n)] }), /FullAccess/i);
await expectReject("add itself a full-access key", () =>
  agent.signAndSendTransaction({ receiverId: agentId, actions: [actions.addFullAccessKey(KeyPair.fromRandom("ed25519").getPublicKey())] }), /FullAccess/i);
await expectReject("delete the agent account", () =>
  agent.signAndSendTransaction({ receiverId: agentId, actions: [actions.deleteAccount("owner1.test.near")] }), /FullAccess/i);

// 8. policy rejection: allowed method, contract says no
await expectReject("settle over cap", () => settle([item("b3:owner", "owner1.test.near", CAP + 1n)]), /POLICY_REJECTED:OverCap/);
let policyMsg = "";
try { await settle([item("b3:owner", "owner1.test.near", CAP + 1n)]); } catch (e) { policyMsg = describe(e); }
const code = policyMsg.match(/POLICY_REJECTED:([A-Za-z]+)/)?.[1];
rows.push({ case: "parse rejection code from JS error", expect: "OverCap", ok: code === "OverCap", got: String(code) });

// 9. failed batch: does near-api-js throw, or return false?
{
  let got: string;
  try {
    const r = await settle([item("b4:owner", "owner1.test.near", 1n), item("b4:cleaner", "ghost.test.near", 1n)]);
    got = `returned ${JSON.stringify(r)} (no throw)`;
  } catch (e) { got = `threw ${describe(e)}`; }
  const paid = await provider.callFunction({ contractId: vault, method: "is_paid", args: { key: "b4:owner" } });
  rows.push({ case: "batch with unregistered payee", expect: "returns false, key unpaid", ok: got.startsWith("returned false") && paid === false, got: `${got}; is_paid=${paid}` });
}

// 10. allowance is being spent
{
  const ak2 = await agent.getAccessKey(fcKey.getPublicKey());
  const left = BigInt((ak2.permission as any).FunctionCall.allowance);
  rows.push({ case: "allowance decreases with use", expect: "< 1 NEAR", ok: left < ALLOWANCE, got: `${(Number(ALLOWANCE - left) / 1e24).toFixed(5)} NEAR used, ${(Number(left) / 1e24).toFixed(5)} left` });
}

// 11. allowance smaller than prepaid-gas cost: what does the agent see?
{
  const tiny = KeyPair.fromRandom("ed25519");
  await new Account(agentId, provider, agentFull.toString() as any).addFunctionCallAccessKey({
    publicKey: tiny.getPublicKey(), contractId: vault, methodNames: ["settle"], allowance: nearToYocto("0.01"),
  });
  const poor = new Account(agentId, provider, tiny.toString() as any);
  await expectReject("settle when allowance < prepaid gas cost", () =>
    poor.callFunction({ contractId: vault, methodName: "settle", args: { items: [item("b5:owner", "owner1.test.near", 1n)] }, gas: teraToGas("300") }),
    /NotEnoughAllowance|allowance/i);
  const gp = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gas_price", params: [null] }) }).then((r) => r.json());
  console.log("[gas] sandbox gas price (yocto/gas):", gp.result?.gas_price);
}

// 12. how much allowance does one settle consume, by attached gas?
{
  const left = async () => BigInt(((await agent.getAccessKey(fcKey.getPublicKey())).permission as any).FunctionCall.allowance);
  for (const tgas of ["300", "100", "50"]) {
    const a = await left();
    await agent.callFunction({ contractId: vault, methodName: "settle", args: { items: [item(`g${tgas}:owner`, "owner1.test.near", 1n)] }, gas: teraToGas(tgas) });
    const b = await left();
    console.log(`[allowance] settle @ ${tgas} TGas consumed ${(Number(a - b) / 1e24).toFixed(5)} NEAR of allowance`);
  }
}

// 13. is the up-front charge refunded to the allowance afterwards?
{
  const left = async () => BigInt(((await agent.getAccessKey(fcKey.getPublicKey())).permission as any).FunctionCall.allowance);
  await new Promise((r) => setTimeout(r, 4000));
  const before = await left();
  await agent.callFunction({ contractId: vault, methodName: "settle", args: { items: [item("r1:owner", "owner1.test.near", 1n)] }, gas: teraToGas("300") });
  const immediately = await left();
  await new Promise((r) => setTimeout(r, 4000));
  const later = await left();
  const f = (x: bigint) => (Number(x) / 1e24).toFixed(5);
  console.log(`[refund] one settle @300 TGas: charged ${f(before - immediately)} right after, net ${f(before - later)} after 4s`);
}

// ---------- report ----------
console.log("\n[spike3] results");
for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"} | ${r.case} | ${r.got}`);
const failed = rows.filter((r) => !r.ok).length;
console.log(`\n[spike3] ${rows.length - failed}/${rows.length} as expected`);
node.kill();
process.exit(failed ? 1 : 0);
