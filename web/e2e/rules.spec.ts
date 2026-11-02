import { expect, test } from "@playwright/test";
import { addPayee, signUp } from "./helpers";

// Rehearsal mode (no chain): the rules render as sentences from the operator's data.
// Live reads from a real vault are covered by test:integration.
test("Vault rules read as plain sentences; no vault → prompt to connect", async ({ page }) => {
  await signUp(page);
  await page.getByTestId("nav-rules").click();
  await expect(page.getByTestId("rules-no-vault")).toBeVisible();

  await page.goto("/people");
  await addPayee(page, { name: "Owen Reyes", role: "Property owner", account: "houserules-owner-1.testnet", cap: "800" });
  await addPayee(page, { name: "Maria Santos", role: "Cleaner", account: "houserules-cleaner-1.testnet", cap: "100" });
  await page.goto("/settings");
  await page.getByLabel("Vault account").fill("vault.houserules-operator.testnet");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("vault-saved")).toBeVisible();

  // approve payees (rehearsal stand-in for the wallet-signed add_payee)
  await page.goto("/people");
  const approve = page.locator('[data-testid^="payee-approve-"]').filter({ hasText: "Approve (rehearsal)" });
  await expect(approve).toHaveCount(2);
  await approve.first().click();
  await expect(approve).toHaveCount(1);
  await approve.first().click();
  await expect(approve).toHaveCount(0);
  await expect(page.getByTestId("payees-table")).not.toContainText("Needs signature");
  await page.getByTestId("nav-overview").click();
  await expect(page.getByTestId("setup-step-sign")).toHaveAttribute("data-done", "true");

  await page.getByTestId("nav-rules").click();
  await expect(page.getByTestId("rules-rehearsal")).toBeVisible();
  await expect(page.getByTestId("policy-rule-allowlist")).toContainText("Pays only these 2 people");
  await expect(page.getByTestId("rule-payee-houserules-cleaner-1.testnet")).toContainText("Maria Santos");
  await expect(page.getByTestId("policy-rule-cap")).toContainText("At most $800.00 per payout");
  await expect(page.getByTestId("policy-rule-cap")).toContainText("Owner up to $800.00 · Cleaner up to $100.00");
  await expect(page.getByTestId("policy-rule-daily-limit")).toContainText("Up to $20,000.00 per day");
  await expect(page.getByTestId("policy-rule-delay")).toContainText("New payees wait 24 hours");
  await expect(page.getByTestId("policy-rule-once")).toContainText("Each booking is paid once");
  await expect(page.getByTestId("policy-rule-agent-key")).toContainText("The agent can only call settle");
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ caret: "initial", path: `${process.env.SCREENSHOT_DIR}/rules.png`, fullPage: true });
});
