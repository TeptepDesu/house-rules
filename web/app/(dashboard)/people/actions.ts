"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/db";
import { createPayee, createProperty } from "@/lib/db/people";
import { parsePercentToBps, parseUsd } from "@/lib/money";
import { checkAccountForNetwork } from "@/lib/near/account";
import { networkId } from "@/lib/near/network";

export type FormState =
  | { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> }
  | undefined;

/** What the user typed, echoed back so React 19's post-action form reset restores it on errors. */
function echo(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}
const PAYEE_FIELDS = ["name", "role", "nearAccount", "cap"];
const PROPERTY_FIELDS = ["name", "ownerPayeeId", "cleanerPayeeId", "cleaningFee", "mgmtFee"];

const MAX_CAP = parseUsd("100000"); // sanity ceiling for a single payout cap

const usd = (field: string, { positive }: { positive: boolean }) =>
  z.string().transform((s, ctx) => {
    try {
      const v = parseUsd(s);
      if (positive && v <= 0n) throw new Error();
      if (v > MAX_CAP) throw new Error();
      return v;
    } catch {
      ctx.addIssue({ code: "custom", message: positive ? `Enter an amount between $0.01 and $100,000` : `Enter an amount like 80 or 80.00`, path: [] });
      return z.NEVER;
    }
  }).describe(field);

const optionalId = z
  .string()
  .optional()
  .transform((s) => (s ? s : undefined));

function fieldErrors(err: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

const payeeSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  role: z.enum(["owner", "cleaner"], { message: "Choose a role" }),
  nearAccount: z
    .string()
    .trim()
    .toLowerCase()
    .superRefine((a, ctx) => {
      const msg = checkAccountForNetwork(a, networkId());
      if (msg) ctx.addIssue({ code: "custom", message: msg });
    }),
  cap: usd("cap", { positive: true }),
});

export async function addPayee(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = echo(formData, PAYEE_FIELDS);
  const parsed = payeeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const { name, role, nearAccount, cap } = parsed.data;
  try {
    const r = await createPayee(user.id, { name, role, nearAccount, capRaw: cap });
    if (!r.ok) return { fieldErrors: { nearAccount: "You've already added this account" }, values };
    await logActivity({ userId: user.id, action: "payee.create", entity: "payee", entityId: r.id, meta: { role, nearAccount } });
  } catch (e) {
    console.error("[people.addPayee] failed", e);
    return { error: "Couldn't save the payee. Try again.", values };
  }
  refresh();
  return { ok: true };
}

const propertySchema = z.object({
  name: z.string().trim().min(1, "Enter a property name").max(80),
  ownerPayeeId: optionalId,
  cleanerPayeeId: optionalId,
  cleaningFee: usd("cleaningFee", { positive: false }),
  mgmtFee: z.string().transform((s, ctx) => {
    try {
      return parsePercentToBps(s);
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a percentage from 0 to 100, like 15" });
      return z.NEVER;
    }
  }),
});

export async function addProperty(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = echo(formData, PROPERTY_FIELDS);
  const parsed = propertySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const { name, ownerPayeeId, cleanerPayeeId, cleaningFee, mgmtFee } = parsed.data;
  try {
    const r = await createProperty(user.id, { name, ownerPayeeId, cleanerPayeeId, cleaningFeeRaw: cleaningFee, mgmtFeeBps: mgmtFee });
    if (!r.ok) {
      const map: Record<string, [string, string]> = {
        invalid_owner: ["ownerPayeeId", "Choose one of your owners"],
        invalid_cleaner: ["cleanerPayeeId", "Choose one of your cleaners"],
        duplicate_name: ["name", "You already have a property with this name"],
      };
      const [field, msg] = map[r.error] ?? ["form", "Couldn't save the property"];
      return { fieldErrors: { [field]: msg }, values };
    }
    await logActivity({ userId: user.id, action: "property.create", entity: "property", entityId: r.id, meta: { name } });
  } catch (e) {
    console.error("[people.addProperty] failed", e);
    return { error: "Couldn't save the property. Try again.", values };
  }
  refresh();
  return { ok: true };
}
