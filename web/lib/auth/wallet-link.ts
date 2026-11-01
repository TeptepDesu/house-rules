// Linking an operator's NEAR wallet (code-review finding #1): the operator signs a one-time
// NEP-413 message with a FULL-ACCESS key of their account. Only then can a vault owned by that
// account be connected, so nobody can point their House Rules account at someone else's vault.
// Pure (provider injected) so it's unit-tested; settings/actions.ts wires it to cookies + RPC.

import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { verifyMessage } from "near-api-js/nep413";

export const LINK_MESSAGE = "Link this NEAR account to House Rules. This proves you control it; it doesn't move any funds.";
export const LINK_RECIPIENT = "house-rules";
const TTL_S = 5 * 60;

const key = (secret: string) => new TextEncoder().encode(secret);

/** A fresh 32-byte nonce, bound to this operator in a short-lived signed token (kept in a cookie). */
export async function makeLinkChallenge(userId: string, secret: string, now = Date.now()) {
  const nonce = new Uint8Array(randomBytes(32));
  const iat = Math.floor(now / 1000);
  const token = await new SignJWT({ n: Buffer.from(nonce).toString("base64") })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + TTL_S)
    .sign(key(secret));
  return { nonce, token };
}

export async function readLinkChallenge(token: string | undefined, userId: string, secret: string, now = Date.now()): Promise<Uint8Array | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"], currentDate: new Date(now) });
    if (payload.sub !== userId || typeof payload.n !== "string") return null;
    const nonce = new Uint8Array(Buffer.from(payload.n, "base64"));
    return nonce.length === 32 ? nonce : null;
  } catch {
    return null;
  }
}

export type SignedLink = { accountId: string; publicKey: string; signature: string /* base64 */ };

/** Verifies the NEP-413 signature over exactly this challenge, by a FullAccess key of accountId. */
export async function verifyWalletLink(i: {
  signed: SignedLink;
  nonce: Uint8Array;
  provider: Parameters<typeof verifyMessage>[0]["provider"];
}): Promise<{ ok: true; accountId: string } | { ok: false; error: string }> {
  try {
    await verifyMessage({
      signerAccountId: i.signed.accountId,
      signerPublicKey: i.signed.publicKey,
      payload: { message: LINK_MESSAGE, recipient: LINK_RECIPIENT, nonce: i.nonce },
      signature: new Uint8Array(Buffer.from(i.signed.signature, "base64")),
      provider: i.provider,
    });
    return { ok: true, accountId: i.signed.accountId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "verification failed" };
  }
}
