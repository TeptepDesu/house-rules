import "server-only";
import { rpcUrl } from "@/lib/near/rpc";
import { createVaultReader } from "@/lib/near/vault";

// A vault may be used for an operator only if, ON-CHAIN, its owner is the operator's verified wallet
// and its agent is this server's agent account (code-review finding #1: no pointing at others' vaults).
export async function checkVaultBinding(
  vault: string,
  operatorAccount: string | null,
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!operatorAccount) return { ok: false, error: "Link your NEAR wallet first, so we can check the vault is yours." };
  let policy: { owner: string; agent: string };
  try {
    policy = await createVaultReader(rpcUrl(), vault).getPolicy();
  } catch {
    return { ok: false, error: `Couldn't read a House Rules vault at ${vault}.` };
  }
  if (policy.owner !== operatorAccount) return { ok: false, error: `That vault belongs to ${policy.owner}, not your linked wallet (${operatorAccount}).` };
  if (env.AGENT_ACCOUNT && policy.agent !== env.AGENT_ACCOUNT) {
    return { ok: false, error: `That vault's agent is ${policy.agent}; this server pays as ${env.AGENT_ACCOUNT}. Update it with set_agent.` };
  }
  return { ok: true };
}
