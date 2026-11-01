import { type Page, expect } from "@playwright/test";

let n = 0;
/** Sign up a fresh operator and land on the dashboard. */
export async function signUp(page: Page, name = "Rina Operator") {
  const email = `op.${Date.now()}.${n++}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-9");
  await page.getByRole("button", { name: "Create account" }).click();
  // the first request of a run pays the dev server's cold start (compile + DB migrations + bcrypt)
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible({ timeout: 20_000 });
  return { email, password: "correct-horse-9" };
}

export async function addPayee(page: Page, p: { name: string; role: "Property owner" | "Cleaner"; account: string; cap: string }) {
  const form = page.getByTestId("payee-form");
  await form.getByLabel("Name").fill(p.name);
  await form.getByLabel("Role").selectOption({ label: p.role });
  await form.getByLabel("NEAR account").fill(p.account);
  await form.getByLabel("Max per payout (USD)").fill(p.cap);
  // wait for the save round-trip, like a person would, before typing the next payee
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/people");
  await form.getByRole("button", { name: "Add payee" }).click();
  await saved;
  await expect(form.getByRole("button", { name: "Add payee" })).toBeEnabled();
}

export async function addProperty(page: Page, name: string, opts: { cleaningFee?: string; mgmtFee?: string } = {}) {
  const form = page.getByTestId("property-form");
  await form.getByLabel("Property name").fill(name);
  await form.getByLabel("Cleaning fee (USD)").fill(opts.cleaningFee ?? "80");
  await form.getByLabel("Management fee (%)").fill(opts.mgmtFee ?? "15");
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/people");
  await form.getByRole("button", { name: "Add property" }).click();
  await saved;
  await expect(page.getByTestId("properties-table").getByRole("row", { name: new RegExp(name) })).toBeVisible();
}

// Playwright runs from web/ (CommonJS specs, so no import.meta)
export const FIXTURES = `${process.cwd()}/test/fixtures/payout-reports/`;
