import { Account, KeyPair } from "near-api-js";
import { signMessage } from "near-api-js/nep413";
import { describe, expect, it } from "vitest";
import { LINK_MESSAGE, LINK_RECIPIENT, makeLinkChallenge, readLinkChallenge, verifyWalletLink } from "./wallet-link";

const SECRET = "test-secret-test-secret-test-secret!!";
const USER = "6f1c2a8e-0000-4000-8000-000000000001";
const NOW = Date.UTC(2026, 10, 1);

// fake RPC: only the access-key lookup verifyMessage needs
const provider = (perm: "FullAccess" | object, knownKey: string) =>
  ({
    viewAccessKey: async ({ publicKey }: { publicKey: unknown }) => {
      if (String(publicKey) !== knownKey) throw new Error("no such key");
      return { permission: perm, nonce: 0n, block_height: 1, block_hash: "x" };
    },
  }) as never;

async function sign(kp: KeyPair, accountId: string, nonce: Uint8Array) {
  const acct = new Account(accountId, provider("FullAccess", kp.getPublicKey().toString()), kp.toString() as `ed25519:${string}`);
  const s = await signMessage({ signerAccount: acct, payload: { message: LINK_MESSAGE, recipient: LINK_RECIPIENT, nonce } });
  return { accountId, publicKey: s.publicKey.toString(), signature: Buffer.from(s.signature).toString("base64") };
}

describe("wallet link challenge", () => {
  it("round-trips the nonce for the same operator before it expires", async () => {
    const c = await makeLinkChallenge(USER, SECRET, NOW);
    expect(c.nonce).toHaveLength(32);
    expect(await readLinkChallenge(c.token, USER, SECRET, NOW + 60_000)).toEqual(c.nonce);
  });
  it("rejects another operator's challenge, an expired one, or a forged one", async () => {
    const c = await makeLinkChallenge(USER, SECRET, NOW);
    expect(await readLinkChallenge(c.token, "someone-else", SECRET, NOW)).toBeNull();
    expect(await readLinkChallenge(c.token, USER, SECRET, NOW + 6 * 60_000)).toBeNull();
    expect(await readLinkChallenge(c.token, USER, "x".repeat(40), NOW)).toBeNull();
    expect(await readLinkChallenge(undefined, USER, SECRET, NOW)).toBeNull();
  });
});

describe("verifyWalletLink (NEP-413)", () => {
  const kp = KeyPair.fromRandom("ed25519");
  const pub = kp.getPublicKey().toString();

  it("accepts a full-access key's signature over this exact challenge", async () => {
    const nonce = (await makeLinkChallenge(USER, SECRET, NOW)).nonce;
    const signed = await sign(kp, "operator.testnet", nonce);
    expect(await verifyWalletLink({ signed, nonce, provider: provider("FullAccess", pub) })).toEqual({ ok: true, accountId: "operator.testnet" });
  });

  it("rejects a signature over a different nonce (replay)", async () => {
    const signed = await sign(kp, "operator.testnet", new Uint8Array(32).fill(7));
    const nonce = new Uint8Array(32).fill(8);
    expect(await verifyWalletLink({ signed, nonce, provider: provider("FullAccess", pub) })).toMatchObject({ ok: false });
  });

  it("rejects a function-call key (it can't prove control of the account)", async () => {
    const nonce = new Uint8Array(32).fill(1);
    const signed = await sign(kp, "operator.testnet", nonce);
    const fc = { FunctionCall: { allowance: null, receiver_id: "x", method_names: [] } };
    expect(await verifyWalletLink({ signed, nonce, provider: provider(fc, pub) })).toMatchObject({ ok: false });
  });

  it("rejects a key that isn't on that account, and a tampered signature", async () => {
    const nonce = new Uint8Array(32).fill(2);
    const signed = await sign(kp, "operator.testnet", nonce);
    expect(await verifyWalletLink({ signed, nonce, provider: provider("FullAccess", "ed25519:other") })).toMatchObject({ ok: false });
    const bad = { ...signed, signature: Buffer.from(new Uint8Array(64).fill(1)).toString("base64") };
    expect(await verifyWalletLink({ signed: bad, nonce, provider: provider("FullAccess", pub) })).toMatchObject({ ok: false });
  });
});
