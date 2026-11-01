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
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
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
