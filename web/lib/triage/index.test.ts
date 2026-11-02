import { describe, expect, it } from "vitest";
import { PAY_LINK, draftFollowUp, keepsTheFacts, nearAiConfig, polishWithNearAi } from "./index";

const U = 1_000_000n;
const base = { businessName: "Casa Hosts", guestName: "Diego Santos", propertyName: "Casa Azul", checkIn: "2026-10-04", checkOut: "2026-10-09" };

describe("draftFollowUp (deterministic, no AI)", () => {
  it("open damage claim: polite, exact amount, the pay link placeholder, first name only", () => {
    const d = draftFollowUp({ ...base, reason: "open_penalty", amountRaw: 200n * U, description: "Damage: broken lamp" })!;
    expect(d.subject).toBe("Casa Hosts: $200.00 for your stay at Casa Azul");
    expect(d.body).toContain("Hi Diego,");
    expect(d.body).toContain("Damage: broken lamp");
    expect(d.body).toContain("$200.00");
    expect(d.body).toContain(PAY_LINK);
    expect(d.body).toContain("any chain");
    expect(d.body).not.toContain("Santos");
    expect(keepsTheFacts(d.body, ["$200.00"])).toBe(true); // the template itself passes the AI guard
  });

  it("unpaid direct stay: a reminder with the total and dates", () => {
    const d = draftFollowUp({ ...base, reason: "unpaid", amountRaw: 600n * U, description: "Stay at Casa Azul, Oct 4 – Oct 9" })!;
    expect(d.subject).toBe("Casa Hosts: payment for your stay at Casa Azul");
    expect(d.body).toContain("Oct 4 – Oct 9");
    expect(d.body).toContain("$600.00");
    expect(d.body).toContain(PAY_LINK);
  });

  it("nothing to send to a guest when the channel paid short (that's between you and the channel)", () => {
    expect(draftFollowUp({ ...base, reason: "mismatch", amountRaw: 20n * U, description: "" })).toBeNull();
  });
});

describe("keepsTheFacts: an AI rewrite may change words, never money or the link", () => {
  const facts = ["$200.00"];
  it("accepts a rewrite with the amount and exactly one pay link", () => {
    expect(keepsTheFacts(`Hello Diego, please pay $200.00 here: ${PAY_LINK}`, facts)).toBe(true);
  });
  it("rejects a changed amount, a dropped or duplicated link, or a smuggled URL", () => {
    expect(keepsTheFacts(`Please pay $250.00: ${PAY_LINK}`, facts)).toBe(false);
    expect(keepsTheFacts("Please pay $200.00 soon.", facts)).toBe(false);
    expect(keepsTheFacts(`$200.00 ${PAY_LINK} ${PAY_LINK}`, facts)).toBe(false);
    expect(keepsTheFacts(`$200.00 ${PAY_LINK} or pay at https://evil.example/pay`, facts)).toBe(false);
    expect(keepsTheFacts(`$200.00 ${PAY_LINK} and also $5.00 tip`, facts)).toBe(false);
  });
});

describe("NEAR AI Cloud (optional)", () => {
  it("is off unless both a key and a model are configured", () => {
    expect(nearAiConfig({})).toBeNull();
    expect(nearAiConfig({ NEAR_AI_API_KEY: "sk-x" })).toBeNull();
    expect(nearAiConfig({ NEAR_AI_API_KEY: "sk-x", NEAR_AI_MODEL: "m" })).toEqual({ apiKey: "sk-x", model: "m", baseUrl: "https://cloud-api.near.ai/v1" });
  });

  const draft = { subject: "s", body: `Hi Diego, $200.00 here: ${PAY_LINK}` };
  const reply = (content: string, status = 200) =>
    (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })) as unknown as typeof fetch;

  it("sends an OpenAI-style chat request with the draft only, and returns the rewrite when it keeps the facts", async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ choices: [{ message: { content: `Hello Diego! Kindly settle $200.00 via ${PAY_LINK}` } }] }));
    }) as unknown as typeof fetch;
    const out = await polishWithNearAi(draft, ["$200.00"], { apiKey: "sk-x", model: "m", baseUrl: "https://cloud-api.near.ai/v1" }, f);
    expect(out).toBe(`Hello Diego! Kindly settle $200.00 via ${PAY_LINK}`);
    expect(sent!.url).toBe("https://cloud-api.near.ai/v1/chat/completions");
    expect((sent!.init.headers as Record<string, string>).authorization).toBe("Bearer sk-x");
    const body = JSON.parse(String(sent!.init.body));
    expect(body.model).toBe("m");
    expect(JSON.stringify(body.messages)).toContain(PAY_LINK);
    expect(JSON.stringify(body.messages)).not.toMatch(/https?:\/\//);
  });

  it("falls back (null) when the rewrite changes facts, the API errors, or it times out", async () => {
    const cfg = { apiKey: "sk-x", model: "m", baseUrl: "https://cloud-api.near.ai/v1" };
    expect(await polishWithNearAi(draft, ["$200.00"], cfg, reply(`Pay $20.00 at ${PAY_LINK}`))).toBeNull();
    expect(await polishWithNearAi(draft, ["$200.00"], cfg, reply("x", 500))).toBeNull();
    const boom = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await polishWithNearAi(draft, ["$200.00"], cfg, boom)).toBeNull();
  });
});
