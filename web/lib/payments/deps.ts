import "server-only";
import { createOneClickClient } from "@/lib/intents/client";
import { usdcCreditedTo } from "@/lib/intents";
import { sharedMockOneClick } from "@/lib/intents/mock";
import { oneClickMode } from "@/lib/intents/provider";
import { fetchTxOutcome } from "@/lib/near/rpc";
import type { PaymentDeps } from "./service";

// Wires the payment service to real or mock I/O. Secrets stay here (server-only).
//   ONECLICK_MODE        mock (default outside production) | live
//   ONECLICK_API_KEY     optional; without it 1Click charges 0.2%
//   USDC_ASSET_ID        1Click asset id of USDC on NEAR (live)        — confirm in spike #2
//   USDC_TOKEN_ACCOUNT   NEAR account of the USDC contract (live)      — confirm in spike #2
//   INTENTS_SENDERS      comma-separated signer(s) of 1Click deliveries — confirm in spike #2

export function usdcAssetId(): string {
  if (oneClickMode() === "mock") return "nep141:usdc.mock";
  const v = process.env.USDC_ASSET_ID;
  if (!v) throw new Error("USDC_ASSET_ID is not set");
  return v;
}

export function paymentDeps(vaultAccount: string): PaymentDeps {
  if (oneClickMode() === "mock") {
    const mock = sharedMockOneClick();
    return {
      oneClick: mock,
      verifyDelivery: async (hashes) => hashes.reduce((a, h) => a + mock.creditedByMockTx(h), 0n),
      now: () => new Date(),
    };
  }
  const token = process.env.USDC_TOKEN_ACCOUNT;
  if (!token) throw new Error("USDC_TOKEN_ACCOUNT is not set");
  const senders = (process.env.INTENTS_SENDERS || "intents.near").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    oneClick: createOneClickClient({ apiKey: process.env.ONECLICK_API_KEY || undefined }),
    verifyDelivery: async (hashes) => {
      let total = 0n;
      for (const h of hashes) {
        for (const sender of senders) {
          const tx = await fetchTxOutcome(h, sender);
          if (tx) {
            total += usdcCreditedTo(tx, token, vaultAccount);
            break;
          }
        }
      }
      return total;
    },
    now: () => new Date(),
  };
}
