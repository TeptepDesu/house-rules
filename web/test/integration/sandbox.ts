// Local NEAR sandbox for integration tests: starts nearcore's sandbox binary (built by the
// contracts' cargo tests), deploys the real vault + mock USDC, and hands back keys/accounts.
// Sandbox only: local accounts and throwaway keys; nothing touches a public network.

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Account, JsonRpcProvider, KeyPair, actions, nearToYocto, teraToGas } from "near-api-js";

const CONTRACTS = join(process.cwd(), "..", "contracts");
export const WASM = { vault: join(CONTRACTS, "target/near/vault/vault.wasm"), ft: join(CONTRACTS, "target/near/mock_ft/mock_ft.wasm") };

export function findSandboxBinary(): string | null {
  const build = join(CONTRACTS, "target/debug/build");
  if (!existsSync(build)) return null;
  for (const d of readdirSync(build).filter((n) => n.startsWith("near-sandbox-"))) {
    const near = join(build, d, "out/.near");
    if (!existsSync(near)) continue;
    for (const v of readdirSync(near)) {
      const bin = join(near, v, "near-sandbox");
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}

export const sandboxAvailable = () => !!findSandboxBinary() && existsSync(WASM.vault) && existsSync(WASM.ft);

export type Sandbox = Awaited<ReturnType<typeof startSandbox>>;

export async function startSandbox(port: number) {
  const bin = findSandboxBinary();
  if (!bin) throw new Error("near-sandbox binary not found: run `cargo test -p vault --test sandbox` in contracts/ once");
  const home = join(tmpdir(), `hr-sbx-${port}-${process.pid}`);
  rmSync(home, { recursive: true, force: true });
  execFileSync(bin, ["--home", home, "init"], { stdio: "ignore" });
  const cfg = JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
  cfg.rpc.addr = `127.0.0.1:${port}`;
  cfg.network.addr = `127.0.0.1:${port + 1000}`;
  writeFileSync(join(home, "config.json"), JSON.stringify(cfg));
  const node: ChildProcess = spawn(bin, ["--home", home, "run"], { stdio: "ignore" });
  const rpcUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      const s = await fetch(`${rpcUrl}/status`).then((r) => r.json());
      if (s.sync_info?.latest_block_height > 1) break;
    } catch {}
    if (i > 160) throw new Error("sandbox did not start");
    await new Promise((r) => setTimeout(r, 250));
  }
  const vk = JSON.parse(readFileSync(join(home, "validator_key.json"), "utf8"));
  const provider = new JsonRpcProvider({ url: rpcUrl });
  const rootKey = KeyPair.fromString(vk.secret_key);
  const root = new Account(vk.account_id, provider, vk.secret_key);
  const as = (id: string, key: string = vk.secret_key) => new Account(id, provider, key as `ed25519:${string}`);

  async function makeAccount(id: string, extra: ReturnType<typeof actions.functionCall>[] = [], wasm?: string, key = rootKey) {
    const acts = [actions.createAccount(), actions.transfer(nearToYocto("20")), actions.addFullAccessKey(key.getPublicKey())];
    if (wasm) acts.push(actions.deployContract(readFileSync(wasm)));
    acts.push(...extra);
    await root.signAndSendTransaction({ receiverId: id, actions: acts });
  }

  return {
    rpcUrl,
    rootKey: vk.secret_key as string,
    as,
    makeAccount,
    call: (who: string, contract: string, method: string, args: object, deposit = 0n, tgas: `${number}` = "100") =>
      as(who).signAndSendTransaction({ receiverId: contract, actions: [actions.functionCall(method, args, teraToGas(tgas), deposit)], throwOnFailure: false }),
    stop() {
      node.kill();
      rmSync(home, { recursive: true, force: true });
    },
  };
}
