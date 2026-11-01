// Minimal typed client for the NEAR Intents 1Click API (docs.near-intents.org/api-reference/oneclick).
// Server-only: the API key must never reach a client component. Mainnet only (no testnet);
// tests mock fetch. Without a key the API still works but charges a 0.2% fee.

import { z } from "zod";

export const ONECLICK_BASE_URL = "https://1click.chaindefuser.com";

export const STATUSES = ["KNOWN_DEPOSIT_TX", "PENDING_DEPOSIT", "INCOMPLETE_DEPOSIT", "PROCESSING", "SUCCESS", "REFUNDED", "FAILED"] as const;
export type OneClickStatus = (typeof STATUSES)[number];

export type QuoteRequest = {
  dry: boolean;
  swapType: "EXACT_INPUT" | "EXACT_OUTPUT" | "FLEX_INPUT";
  slippageTolerance: number; // bps
  originAsset: string;
  depositType: "ORIGIN_CHAIN" | "INTENTS" | "CONFIDENTIAL_INTENTS";
  destinationAsset: string;
  amount: string; // base units, integer string
  refundTo: string;
  refundType: "ORIGIN_CHAIN" | "INTENTS" | "CONFIDENTIAL_INTENTS";
  recipient: string;
  recipientType: "DESTINATION_CHAIN" | "INTENTS" | "CONFIDENTIAL_INTENTS";
  deadline: string; // ISO 8601
  confidentiality?: "public" | "basic" | "advanced";
  quoteWaitingTimeMs?: number;
};

const QuoteResponse = z.object({
  correlationId: z.string(),
  timestamp: z.string(),
  signature: z.string(),
  quoteRequest: z.record(z.string(), z.unknown()),
  quote: z.looseObject({
    depositAddress: z.string().optional(),
    depositMemo: z.string().optional(),
    amountIn: z.string(),
    minAmountIn: z.string(),
    amountOut: z.string(),
    minAmountOut: z.string(),
    deadline: z.string().optional(),
    timeWhenInactive: z.string().optional(),
    timeEstimate: z.number(),
  }),
});
export type QuoteResponse = z.infer<typeof QuoteResponse>;

const TxDetails = z.object({ hash: z.string(), explorerUrl: z.string() });
const StatusResponse = z.object({
  correlationId: z.string(),
  quoteResponse: z.unknown(),
  // keep unknown future statuses parseable; mapStatus treats them as "processing", never paid
  status: z.string(),
  updatedAt: z.string(),
  swapDetails: z.looseObject({
    intentHashes: z.array(z.string()),
    nearTxHashes: z.array(z.string()),
    amountIn: z.string().optional(),
    amountOut: z.string().optional(),
    depositedAmount: z.string().optional(),
    refundedAmount: z.string().optional(),
    refundReason: z.string().optional(),
    originChainTxHashes: z.array(TxDetails),
    destinationChainTxHashes: z.array(TxDetails),
  }),
});
export type StatusResponse = z.infer<typeof StatusResponse>;

const Token = z.looseObject({ assetId: z.string(), decimals: z.number(), blockchain: z.string(), symbol: z.string() });
export type Token = z.infer<typeof Token>;

export class OneClickError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OneClickError";
  }
}

export function createOneClickClient(opts: { apiKey?: string; baseUrl?: string; fetch?: typeof fetch } = {}) {
  const base = opts.baseUrl ?? ONECLICK_BASE_URL;
  const f = opts.fetch ?? fetch;
  const headers = (json: boolean): Record<string, string> => ({
    accept: "application/json",
    ...(json ? { "content-type": "application/json" } : {}),
    ...(opts.apiKey ? { "X-API-Key": opts.apiKey } : {}),
  });

  async function call<T>(schema: z.ZodType<T>, path: string, init: RequestInit): Promise<T> {
    const res = await f(`${base}${path}`, init);
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : res.statusText;
      throw new OneClickError(res.status, msg);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new OneClickError(res.status, `Unexpected response from 1Click ${path}`);
    return parsed.data;
  }

  return {
    tokens: () => call(z.array(Token), "/v0/tokens", { method: "GET", headers: headers(false) }),
    quote: (req: QuoteRequest) => call(QuoteResponse, "/v0/quote", { method: "POST", headers: headers(true), body: JSON.stringify(req) }),
    status: (depositAddress: string, depositMemo?: string) => {
      const q = new URLSearchParams({ depositAddress, ...(depositMemo ? { depositMemo } : {}) });
      return call(StatusResponse, `/v0/status?${q}`, { method: "GET", headers: headers(false) });
    },
  };
}
