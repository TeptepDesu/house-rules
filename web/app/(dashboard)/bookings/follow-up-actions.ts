"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/db";
import { listBookingsWithRecon } from "@/lib/db/bookings";
import { openInvoicesForBooking } from "@/lib/db/invoices";
import { formatUsd } from "@/lib/money";
import { type Draft, draftFollowUp, nearAiConfig, polishWithNearAi } from "@/lib/triage";

// Follow-up messages for blocked bookings. Built server-side from the operator's own records (the
// browser only supplies a booking id); the browser swaps {PAY_LINK} for the full link. Nothing is
// sent: the operator copies the message.

export type FollowUp = { ok: true; draft: Draft; payPath: string; ai: "available" | "off" | "used" | "kept_template" } | { ok: false; error: string };

async function build(userId: string, businessName: string, bookingId: string) {
  if (!z.string().uuid().safeParse(bookingId).success) return null;
  const b = (await listBookingsWithRecon(userId)).find((x) => x.id === bookingId);
  if (!b || (b.recon.result !== "open_penalty" && b.recon.result !== "unpaid")) return null;
  const invs = await openInvoicesForBooking(userId, bookingId);
  const inv = invs.find((i) => (b.recon.result === "open_penalty" ? i.type === "penalty" : i.type === "booking"));
  if (!inv) return null;
  const draft = draftFollowUp({
    businessName,
    guestName: b.guestName,
    propertyName: b.propertyName,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    reason: b.recon.result,
    amountRaw: inv.amountRaw,
    description: inv.description,
  });
  return draft ? { draft, payPath: `/pay/${inv.publicId}`, facts: [formatUsd(inv.amountRaw)] } : null;
}

export async function draftFollowUpFor(bookingId: string): Promise<FollowUp> {
  const user = await requireUser();
  const r = await build(user.id, user.name, bookingId);
  if (!r) return { ok: false, error: "There's nothing to ask this guest for right now." };
  return { ok: true, draft: r.draft, payPath: r.payPath, ai: nearAiConfig() ? "available" : "off" };
}

/** Reword with NEAR AI Cloud (private inference). Falls back to the template if anything's off. */
export async function polishFollowUp(bookingId: string): Promise<FollowUp> {
  const user = await requireUser();
  const r = await build(user.id, user.name, bookingId);
  if (!r) return { ok: false, error: "There's nothing to ask this guest for right now." };
  const cfg = nearAiConfig();
  if (!cfg) return { ok: true, draft: r.draft, payPath: r.payPath, ai: "off" };
  const body = await polishWithNearAi(r.draft, r.facts, cfg);
  await logActivity({ userId: user.id, action: "followup.polish", entity: "booking", entityId: bookingId, meta: { used: body !== null } });
  return body ? { ok: true, draft: { ...r.draft, body }, payPath: r.payPath, ai: "used" } : { ok: true, draft: r.draft, payPath: r.payPath, ai: "kept_template" };
}
