"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/db";
import { createChargeInvoice, waiveInvoice } from "@/lib/db/invoices";
import { syncPayments } from "@/lib/payments/sync";
import { parseUsd } from "@/lib/money";

export type ChargeState =
  | { ok?: boolean; publicId?: string; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> }
  | undefined;

const FIELDS = ["bookingId", "type", "description", "amount", "operatorRevenue", "dueDate"];
const MAX = parseUsd("50000");

const Schema = z.object({
  bookingId: z.string().uuid("Choose the booking to charge"),
  type: z.enum(["penalty", "extension"], { message: "Choose what this charge is for" }),
  description: z.string().trim().min(3, "Say what this is for, e.g. Damage: broken lamp").max(140),
  amount: z.string().transform((s, ctx) => {
    try {
      const v = parseUsd(s);
      if (v <= 0n || v > MAX) throw new Error();
      return v;
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter an amount between $0.01 and $50,000" });
      return z.NEVER;
    }
  }),
  operatorRevenue: z.string().optional().transform((v) => v === "on"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date"),
});

export async function createCharge(_prev: ChargeState, formData: FormData): Promise<ChargeState> {
  const user = await requireUser();
  const values = Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0] ?? "form")] ??= i.message;
    return { fieldErrors: fe, values };
  }
  try {
    const r = await createChargeInvoice(user.id, { ...parsed.data, amountRaw: parsed.data.amount });
    if (!r.ok) return { fieldErrors: { bookingId: "Choose one of your bookings" }, values };
    await logActivity({
      userId: user.id,
      action: "invoice.create",
      entity: "invoice",
      entityId: r.id,
      meta: { type: parsed.data.type, amount: parsed.data.amount.toString() },
    });
    refresh();
    return { ok: true, publicId: r.publicId };
  } catch (e) {
    console.error("[invoices.createCharge] failed", e);
    return { error: "Couldn't create the invoice. Try again.", values };
  }
}

const PublicId = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
const WAIVE_ERRORS: Record<string, string> = {
  payment_in_progress: "The guest is paying right now. Try again once their payment finishes or its address expires (1 hour).",
  not_open: "This invoice is already paid or closed.",
  not_waivable: "This is the stay itself, so it can't be waived.",
  not_found: "Invoice not found.",
};

/** Forgive an open charge: it stops blocking the booking's payout. Never while a payment can land. */
export async function waiveCharge(publicId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!PublicId.safeParse(publicId).success) return { ok: false, error: WAIVE_ERRORS.not_found };
  try {
    // ask 1Click first: our rows only know what the last poll saw
    const { failed } = await syncPayments(user.id, { publicId });
    if (failed > 0) return { ok: false, error: "Couldn't check the guest's payment, so nothing was waived. Try again in a moment." };
    const r = await waiveInvoice(user.id, publicId, new Date());
    if (!r.ok) return { ok: false, error: WAIVE_ERRORS[r.error] ?? "Couldn't waive it. Try again." };
    await logActivity({ userId: user.id, action: "invoice.waive", entity: "invoice", entityId: r.id, meta: { amount: r.amountRaw.toString(), description: r.description } });
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("[invoices.waiveCharge] failed", e);
    return { ok: false, error: "Couldn't waive it. Try again." };
  }
}
