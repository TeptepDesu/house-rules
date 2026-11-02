"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/db";
import { acceptCollected, createDirectBooking } from "@/lib/db/bookings";
import { parseUsd } from "@/lib/money";

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

export type DirectBookingState =
  | { ok: true; externalRef: string; publicId: string; guestName: string; total: string }
  | { ok?: false; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> }
  | undefined;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX = parseUsd("50000");
const DirectSchema = z
  .object({
    guestName: z.string().trim().min(2, "Enter the guest's name").max(80),
    propertyId: z.string().uuid("Choose a property"),
    checkIn: z.string().regex(DATE, "Choose the check-in date"),
    checkOut: z.string().regex(DATE, "Choose the check-out date"),
    total: z.string().transform((s, ctx) => {
      try {
        const v = parseUsd(s);
        if (v <= 0n || v > MAX) throw new Error();
        return v;
      } catch {
        ctx.addIssue({ code: "custom", message: "Enter the total between $0.01 and $50,000" });
        return z.NEVER;
      }
    }),
    dueDate: z.string().regex(DATE, "Choose when the guest should pay by"),
  })
  .refine((d) => d.checkOut > d.checkIn, { path: ["checkOut"], message: "Check-out must be after check-in" });

const DIRECT_FIELDS = ["guestName", "propertyId", "checkIn", "checkOut", "total", "dueDate"];

/** A booking taken directly (not through a channel): creates it and the invoice the guest pays. */
export async function newDirectBooking(_prev: DirectBookingState, formData: FormData): Promise<DirectBookingState> {
  const user = await requireUser();
  const values = Object.fromEntries(DIRECT_FIELDS.map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = DirectSchema.safeParse(values);
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0] ?? "form")] ??= i.message;
    return { fieldErrors: fe, values };
  }
  const d = parsed.data;
  try {
    const r = await createDirectBooking(user.id, { propertyId: d.propertyId, guestName: d.guestName, checkIn: d.checkIn, checkOut: d.checkOut, totalRaw: d.total, dueDate: d.dueDate });
    if (!r.ok) return { fieldErrors: r.error === "invalid_property" ? { propertyId: "Choose one of your properties" } : { checkOut: "Check-out must be after check-in" }, values };
    await logActivity({ userId: user.id, action: "booking.create_direct", entity: "booking", entityId: r.id, meta: { ref: r.externalRef, amount: d.total.toString() } });
    refresh();
    return { ok: true, externalRef: r.externalRef, publicId: r.publicId, guestName: d.guestName, total: d.total.toString() };
  } catch (e) {
    console.error("[bookings.newDirectBooking] failed", e);
    return { error: "Couldn't create the booking. Try again.", values };
  }
}
