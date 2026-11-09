import type { NextRequest } from "next/server";
import { applyPaymentUpdate, findPayment, getPublicInvoice } from "@/lib/db/invoices";
import { paymentDeps } from "@/lib/payments/deps";
import { pollPayment } from "@/lib/payments/service";

// Public polling for a guest's payment. The server asks 1Click and the chain; the client never
// tells us it paid. Only deposit addresses issued for this invoice can be polled.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/pay/[publicId]/status">) {
  const { publicId } = await ctx.params;
  const depositAddress = req.nextUrl.searchParams.get("d") ?? "";
  const inv = await getPublicInvoice(publicId);
  if (!inv) return Response.json({ error: "Not found" }, { status: 404 });
  const payment = await findPayment(inv.id, depositAddress);
  if (!payment) return Response.json({ error: "Not found" }, { status: 404 });

  // already final: answer from the DB without calling out
  if (payment.status === "verified" || payment.status === "refunded") {
    return Response.json({ paymentStatus: payment.status, invoiceStatus: inv.status, amountReceived: payment.amountReceivedRaw.toString() });
  }
  try {
    const r = await pollPayment(paymentDeps(inv.vaultAccount ?? ""), { depositAddress, depositMemo: payment.depositMemo, deadline: payment.quoteDeadline, invoiceAmount: inv.amountRaw });
    await applyPaymentUpdate(inv.id, payment.id, r);
    const fresh = await getPublicInvoice(publicId);
    return Response.json({ paymentStatus: r.paymentStatus, invoiceStatus: fresh?.status ?? r.invoiceStatus, amountReceived: r.amountReceived.toString() });
  } catch (e) {
    console.error("[pay.status] failed", e);
    return Response.json({ error: "Couldn't check the payment right now." }, { status: 502 });
  }
}
