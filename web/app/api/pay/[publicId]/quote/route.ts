import type { NextRequest } from "next/server";
import { z } from "zod";
import { getPublicInvoice, recordPaymentStart } from "@/lib/db/invoices";
import { OneClickError } from "@/lib/intents/client";
import { paymentDeps, usdcAssetId } from "@/lib/payments/deps";
import { startPayment } from "@/lib/payments/service";

// Public: a guest asks for a deposit address for this invoice. The amount and recipient (vault)
// come from the server, never from the request.
const Body = z.object({
  originAsset: z.string().min(1).max(200),
  refundTo: z.string().trim().min(2, "Enter the address refunds should go to").max(200),
});

export async function POST(req: NextRequest, ctx: RouteContext<"/api/pay/[publicId]/quote">) {
  const { publicId } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const inv = await getPublicInvoice(publicId);
  if (!inv) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const r = await startPayment(paymentDeps(inv.vaultAccount ?? ""), {
      invoice: { id: inv.id, amountRaw: inv.amountRaw, status: inv.status },
      vaultAccount: inv.vaultAccount,
      usdcAssetId: usdcAssetId(),
      originAsset: parsed.data.originAsset,
      refundTo: parsed.data.refundTo,
    });
    if (!r.ok) {
      const msg = r.error === "no_vault" ? "This invoice can't be paid online yet." : "This invoice is no longer open for payment.";
      return Response.json({ error: msg }, { status: 409 });
    }
    await recordPaymentStart(inv.id, {
      depositAddress: r.depositAddress,
      depositMemo: r.depositMemo,
      originAsset: parsed.data.originAsset,
      quoteDeadline: r.deadline,
      rawQuoteJson: r.quote, // includes 1Click's signature: kept for disputes
    });
    return Response.json({ depositAddress: r.depositAddress, depositMemo: r.depositMemo ?? null, amountIn: r.amountIn, deadline: r.deadline.toISOString() });
  } catch (e) {
    if (e instanceof OneClickError && e.status === 400) return Response.json({ error: e.message }, { status: 400 });
    console.error("[pay.quote] failed", e);
    return Response.json({ error: "Couldn't create a payment address. Try again." }, { status: 502 });
  }
}
