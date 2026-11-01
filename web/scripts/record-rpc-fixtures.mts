// Records real RPC responses from the real vault on a local sandbox into test/fixtures/rpc/,
// so lib/near parsers are tested against what the chain actually returns, not hand-written JSON.
//
//   (cd ../contracts/vault && cargo near build non-reproducible-wasm)
//   (cd ../contracts/mock-ft && cargo near build non-reproducible-wasm)
//   node scripts/record-rpc-fixtures.mts <near-sandbox-binary> <scratch-dir>
//
// Sandbox only: local accounts, throwaway keys, no network.

import { execFileSync, spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { Account, JsonRpcProvider, KeyPair, actions, nearToYocto, teraToGas } from "near-api-js";

const [bin, home] = process.argv.slice(2);
if (!bin || !home) throw new Error("usage: node scripts/record-rpc-fixtures.mts <near-sandbox-bin> <scratch-dir>");

const PORT = 3132;
const RPC = `http://127.0.0.1:${PORT}`;
const WASM = new URL("../../contracts/target/near/", import.meta.url).pathname;
const OUT = new URL("../test/fixtures/rpc/", import.meta.url).pathname;
const USD = 1_000_000n;

rmSync(home, { recursive: true, force: true });
execFileSync(bin, ["--home", home, "init"], { stdio: "ignore" });
const cfg = JSON.parse(readFileSync(`${home}/config.json`, "utf8"));
cfg.rpc.addr = `127.0.0.1:${PORT}`;
cfg.network.addr = "127.0.0.1:24598";
writeFileSync(`${home}/config.json`, JSON.stringify(cfg));
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
const root = new Account(vk.account_id, provider, vk.secret_key);
const key = KeyPair.fromString(vk.secret_key);
const as = (id: string) => new Account(id, provider, vk.secret_key);

async function make(id: string, wasm?: string, init?: { method: string; args: object; deposit?: bigint }) {
  const acts = [actions.createAccount(), actions.transfer(nearToYocto("20")), actions.addFullAccessKey(key.getPublicKey())];
  if (wasm) acts.push(actions.deployContract(readFileSync(`${WASM}${wasm}`)));
  if (init) acts.push(actions.functionCall(init.method, init.args, teraToGas("100"), init.deposit ?? 0n));
  await root.signAndSendTransaction({ receiverId: id, actions: acts });
}

const usdc = "usdc.test.near", vault = "vault.test.near", operator = "operator.test.near", agent = "agent.test.near";
const owen = "owen.test.near", maria = "maria.test.near";
await make(usdc, "mock_ft/mock_ft.wasm", { method: "new", args: {} });
await make(operator);
await make(agent);
await make(owen);
await make(maria);
const deployed = await root.signAndSendTransaction({
  receiverId: vault,
  actions: [
    actions.createAccount(),
    actions.transfer(nearToYocto("20")),
    actions.addFullAccessKey(key.getPublicKey()),
    actions.deployContract(readFileSync(`${WASM}vault/vault.wasm`)),
    actions.functionCall(
      "new",
      { owner: operator, agent, token: usdc, daily_limit: (3_000n * USD).toString(), payee_delay_ns: "0" },
      teraToGas("100"),
      nearToYocto("0.01"),
    ),
  ],
});

const call = (who: string, contractId: string, methodName: string, args: object, deposit = 0n, gas: `${number}` = "100") =>
  as(who).signAndSendTransaction({
    receiverId: contractId,
    actions: [actions.functionCall(methodName, args, teraToGas(gas), deposit)],
    throwOnFailure: false,
  });

const save = (name: string, v: unknown) => {
  writeFileSync(`${OUT}${name}.json`, JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2) + "\n");
  console.log(`saved ${name}.json`);
};

save("vault-deploy-init", deployed);
save("add-payee", await call(operator, vault, "add_payee", { account_id: owen, role: "owner", cap_per_payout: (800n * USD).toString() }, nearToYocto("0.01")));
await call(operator, vault, "add_payee", { account_id: maria, role: "cleaner", cap_per_payout: (100n * USD).toString() }, nearToYocto("0.01"));
await call(usdc, usdc, "mint", { account_id: vault, amount: (1_000n * USD).toString() });

const item = (key: string, payee: string, amount: bigint) => ({ key, payee, amount: amount.toString() });
save("settle-success", await call(agent, vault, "settle", { items: [item("bk1:owner", owen, 300n * USD), item("bk1:cleaner", maria, 50n * USD)] }, 0n, "300"));
save("settle-policy-rejected", await call(agent, vault, "settle", { items: [item("bk2:cleaner", maria, 101n * USD)] }, 0n, "300"));
await call(maria, usdc, "storage_unregister", { force: true }, 1n, "30");
save("settle-batch-failed", await call(agent, vault, "settle", { items: [item("bk3:owner", owen, 10n * USD), item("bk3:cleaner", maria, 5n * USD)] }, 0n, "300"));

node.kill();
process.exit(0);
