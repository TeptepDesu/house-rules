import type { NextRequest } from "next/server";
import { getPublicInvoice } from "@/lib/db/invoices";
import { guestPayOptions } from "@/lib/intents/chains";
import { createOneClickClient } from "@/lib/intents/client";
import { sharedMockOneClick } from "@/lib/intents/mock";
import { oneClickMode } from "@/lib/intents/provider";

// Assets a guest can pay with (the list is in lib/intents/chains.ts). Public, but only for a real invoice.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/pay/[publicId]/tokens">) {
  const { publicId } = await ctx.params;
  if (!(await getPublicInvoice(publicId))) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const all = oneClickMode() === "mock" ? await sharedMockOneClick().tokens() : await createOneClickClient({ apiKey: process.env.ONECLICK_API_KEY || undefined }).tokens();
    const tokens = guestPayOptions(all).map((t) => ({ assetId: t.assetId, symbol: t.symbol, blockchain: t.blockchain, decimals: t.decimals }));
    return Response.json({ tokens });
  } catch (e) {
    console.error("[pay.tokens] failed", e);
    return Response.json({ error: "Payment options are unavailable right now." }, { status: 502 });
  }
}
