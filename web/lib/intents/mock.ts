// In-process stand-in for the 1Click API (dev, tests, demo rehearsals). Same shapes as the real
// client. A deposit only "arrives" when simulateDeposit() is called (dev-only endpoint).
// Never used in production: see provider.ts.

import { randomBytes } from "node:crypto";
import type { QuoteRequest, QuoteResponse, StatusResponse, Token } from "./client";

type Entry = { req: QuoteRequest; paid: boolean; polls: number };

const TOKENS: Token[] = [
  { assetId: "nep141:arb-usdc.mock", decimals: 6, blockchain: "arb", symbol: "USDC" },
  { assetId: "nep141:base-usdc.mock", decimals: 6, blockchain: "base", symbol: "USDC" },
  { assetId: "nep141:eth.mock", decimals: 18, blockchain: "eth", symbol: "ETH" },
  { assetId: "nep141:sol.mock", decimals: 9, blockchain: "sol", symbol: "SOL" },
  { assetId: "nep141:wrap.mock", decimals: 24, blockchain: "near", symbol: "NEAR" },
];

export function createMockOneClick(store = new Map<string, Entry>()) {
  return {
    async tokens(): Promise<Token[]> {
      return TOKENS;
    },
    async quote(req: QuoteRequest): Promise<QuoteResponse> {
      const depositAddress = `mock-${randomBytes(12).toString("hex")}`;
      store.set(depositAddress, { req, paid: false, polls: 0 });
      // pretend the guest pays ~0.5% over the output for fees/slippage
      const amountIn = ((BigInt(req.amount) * 1005n) / 1000n).toString();
      return {
        correlationId: `mock-${depositAddress}`,
        timestamp: new Date().toISOString(),
        signature: "mock-signature",
        quoteRequest: req as unknown as Record<string, unknown>,
        quote: {
          depositAddress,
          amountIn,
          minAmountIn: req.amount,
          amountOut: req.amount,
          minAmountOut: req.amount,
          deadline: req.deadline,
          timeEstimate: 20,
        },
      };
    },
    async status(depositAddress: string): Promise<StatusResponse> {
      const e = store.get(depositAddress);
      if (!e) throw new Error("Deposit address not found");
      let status = "PENDING_DEPOSIT";
      if (e.paid) status = e.polls++ === 0 ? "PROCESSING" : "SUCCESS";
      const done = status === "SUCCESS";
      return {
        correlationId: `mock-${depositAddress}`,
        quoteResponse: {},
        status,
        updatedAt: new Date().toISOString(),
        swapDetails: {
          intentHashes: [],
          nearTxHashes: done ? [`mock-tx-${depositAddress}`] : [],
          amountOut: done ? e.req.amount : undefined,
          originChainTxHashes: e.paid ? [{ hash: `mock-origin-${depositAddress}`, explorerUrl: "" }] : [],
          destinationChainTxHashes: done ? [{ hash: `mock-tx-${depositAddress}`, explorerUrl: "" }] : [],
        },
      };
    },
    /** Dev/test only: the guest "sends" the deposit. */
    simulateDeposit(depositAddress: string): boolean {
      const e = store.get(depositAddress);
      if (!e) return false;
      e.paid = true;
      return true;
    },
    /** Mock verifier: a mock tx "credits" exactly what was quoted. */
    creditedByMockTx(hash: string): bigint {
      const e = store.get(hash.replace(/^mock-tx-/, ""));
      return e ? BigInt(e.req.amount) : 0n;
    },
  };
}

export type MockOneClick = ReturnType<typeof createMockOneClick>;

/** One store per server process (survives module re-evaluation in dev). */
export function sharedMockOneClick(): MockOneClick {
  const g = globalThis as unknown as { __hrMockOneClick?: MockOneClick };
  g.__hrMockOneClick ??= createMockOneClick();
  return g.__hrMockOneClick;
}
