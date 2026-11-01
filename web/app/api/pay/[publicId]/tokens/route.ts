import type { NextRequest } from "next/server";
import { getPublicInvoice } from "@/lib/db/invoices";
import { createOneClickClient } from "@/lib/intents/client";
import { sharedMockOneClick } from "@/lib/intents/mock";
import { oneClickMode } from "@/lib/intents/provider";

// Assets a guest can pay with. Public, but only for a real invoice.
const SHOWN = new Set(["USDC", "USDT", "ETH", "SOL", "NEAR", "BTC"]);

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/pay/[publicId]/tokens">) {
  const { publicId } = await ctx.params;
  if (!(await getPublicInvoice(publicId))) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const all = oneClickMode() === "mock" ? await sharedMockOneClick().tokens() : await createOneClickClient({ apiKey: process.env.ONECLICK_API_KEY || undefined }).tokens();
    const tokens = all
      .filter((t) => SHOWN.has(t.symbol))
      .map((t) => ({ assetId: t.assetId, symbol: t.symbol, blockchain: t.blockchain, decimals: t.decimals }));
    return Response.json({ tokens });
  } catch (e) {
    console.error("[pay.tokens] failed", e);
    return Response.json({ error: "Payment options are unavailable right now." }, { status: 502 });
  }
}
