"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/db";
import { acceptCollected } from "@/lib/db/bookings";

const Input = z.object({ bookingId: z.string().uuid(), amount: z.string().regex(/^\d{1,15}$/) });
const ERRORS: Record<string, string> = {
  not_found: "Booking not found.",
  not_mismatch: "This booking isn't short or over any more. Refresh the page.",
  amount_changed: "The collected amount changed since you loaded the page. Refresh and check it again.",
};

/** Accept what was actually collected as final: the booking unblocks and splits on that amount. */
export async function acceptPayout(bookingId: string, amountRaw: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = Input.safeParse({ bookingId, amount: amountRaw });
  if (!parsed.success) return { ok: false, error: ERRORS.not_found };
  try {
    const r = await acceptCollected(user.id, parsed.data.bookingId, BigInt(parsed.data.amount));
    if (!r.ok) return { ok: false, error: ERRORS[r.error] };
    await logActivity({
      userId: user.id,
      action: "booking.accept_payout",
      entity: "booking",
      entityId: parsed.data.bookingId,
      meta: { amount: parsed.data.amount, delta: r.delta.toString() },
    });
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("[bookings.acceptPayout] failed", e);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}
