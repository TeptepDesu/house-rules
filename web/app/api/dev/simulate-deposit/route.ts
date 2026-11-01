import type { NextRequest } from "next/server";
import { sharedMockOneClick } from "@/lib/intents/mock";
import { oneClickMode } from "@/lib/intents/provider";

// DEV/TEST ONLY: pretend the guest sent their deposit to a mock 1Click address.
// 404 in production and whenever 1Click is live.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" || oneClickMode() !== "mock") return new Response(null, { status: 404 });
  const { depositAddress } = ((await req.json().catch(() => ({}))) ?? {}) as { depositAddress?: string };
  if (!depositAddress || !sharedMockOneClick().simulateDeposit(depositAddress)) return Response.json({ error: "Unknown deposit address" }, { status: 404 });
  return Response.json({ ok: true });
}
