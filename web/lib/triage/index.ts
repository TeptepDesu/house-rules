// Exception triage (plan §7 stretch 2): a follow-up message for a blocked booking, so the operator
// can get it unblocked. The draft is deterministic; NEAR AI Cloud (private inference) may only
// reword it. Design rule (plan §6E): an LLM never decides who is paid or how much. Here that means
// the model never sees the pay link (a placeholder) and any rewrite that changes an amount, drops
// or duplicates the link, or adds a URL is thrown away. Nothing is ever sent automatically.

import { formatUsd } from "@/lib/money";
import { stayRange } from "@/lib/ui/format";

import { PAY_LINK } from "./pay-link";

export { PAY_LINK };

export type FollowUpInput = {
  businessName: string;
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  reason: "open_penalty" | "unpaid" | "mismatch";
  amountRaw: bigint;
  description: string;
};
export type Draft = { subject: string; body: string };

const firstName = (full: string) => {
  const t = full.trim();
  // "Lopez, Maria" → "Maria"; "Diego Santos" → "Diego"
  return (t.includes(",") ? t.split(",")[1] : t.split(/\s+/)[0])?.trim() || "there";
};

export function draftFollowUp(i: FollowUpInput): Draft | null {
  const amount = formatUsd(i.amountRaw);
  const hi = `Hi ${firstName(i.guestName)},`;
  const pay = `You can pay here, from any chain and wallet you like: ${PAY_LINK}`;
  const bye = `Thank you,\n${i.businessName}`;
  switch (i.reason) {
    case "open_penalty":
      return {
        subject: `${i.businessName}: ${amount} for your stay at ${i.propertyName}`,
        body: [hi, `Thanks again for staying at ${i.propertyName} (${stayRange(i.checkIn, i.checkOut)}). There's one charge left from your stay: ${i.description}, ${amount}.`, pay, `If anything about this looks wrong, just reply and we'll sort it out.`, bye].join("\n\n"),
      };
    case "unpaid":
      return {
        subject: `${i.businessName}: payment for your stay at ${i.propertyName}`,
        body: [hi, `A friendly reminder that ${amount} for your stay at ${i.propertyName} (${stayRange(i.checkIn, i.checkOut)}) hasn't come through yet.`, pay, bye].join("\n\n"),
      };
    case "mismatch":
      return null; // the channel paid a different amount: settle it with the channel, not the guest
  }
}

const MONEY_RE = /\$\s?[\d,]+(?:\.\d+)?/g;
const URL_RE = /\bhttps?:\/\/|\bwww\./i;

/** True if `text` keeps every fact, has exactly one pay link, no other URL and no other amounts. */
export function keepsTheFacts(text: string, facts: string[]): boolean {
  if (text.split(PAY_LINK).length !== 2) return false;
  if (URL_RE.test(text)) return false;
  if (!facts.every((f) => text.includes(f))) return false;
  const amounts = text.match(MONEY_RE) ?? [];
  return amounts.every((a) => facts.includes(a.replace(/\s/g, "")));
}

export type NearAiConfig = { apiKey: string; model: string; baseUrl: string };

/** Enabled only when the operator configured both a key and a model (server env). */
export function nearAiConfig(env: Record<string, string | undefined> = process.env): NearAiConfig | null {
  if (!env.NEAR_AI_API_KEY || !env.NEAR_AI_MODEL) return null;
  return { apiKey: env.NEAR_AI_API_KEY, model: env.NEAR_AI_MODEL, baseUrl: (env.NEAR_AI_BASE_URL || "https://cloud-api.near.ai/v1").replace(/\/$/, "") };
}

const SYSTEM = [
  "You polish short messages a vacation-rental host sends to a guest.",
  "Keep it warm, brief and plain. Keep the same facts.",
  `Copy every dollar amount exactly. Keep the token ${PAY_LINK} exactly once. Do not add links, amounts, dates or promises.`,
  "Reply with the message body only.",
].join(" ");

/** Ask NEAR AI Cloud to reword the body. Returns null (use the template) on any doubt. */
export async function polishWithNearAi(draft: Draft, facts: string[], cfg: NearAiConfig, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.3,
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: draft.body },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content?.trim();
    return text && keepsTheFacts(text, facts) ? text : null;
  } catch {
    return null;
  }
}
