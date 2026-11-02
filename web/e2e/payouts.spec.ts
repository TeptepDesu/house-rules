import { expect, test } from "@playwright/test";
import { FIXTURES, addPayee, approveAllPayees, signUp } from "./helpers";

// Demo step 4 (plan §11): click Run agent → splits computed, owners and cleaners paid, reconciled
// bookings marked paid out. AGENT_MODE=mock here (simulated vault); the real-vault path is
// covered by `pnpm test:integration` against a NEAR sandbox.

test("Run agent pays every reconciled booking; blocked ones stay; a second run has nothing to do", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Casa Hosts");
  await page.goto("/people");
  await addPayee(page, { name: "Owen Reyes", role: "Property owner", account: "houserules-owner-1.testnet", cap: "800" });
  await addPayee(page, { name: "Maria Santos", role: "Cleaner", account: "houserules-cleaner-1.testnet", cap: "100" });
  const pf = page.getByTestId("property-form");
  for (const name of ["Casa Azul", "Loft 21", "Seaside Cottage"]) {
    await pf.getByLabel("Property name").fill(name);
    await pf.getByLabel("Owner").selectOption({ label: "Owen Reyes" });
    await pf.getByLabel("Cleaner").selectOption({ label: "Maria Santos" });
    await pf.getByLabel("Cleaning fee (USD)").fill("80");
    await pf.getByLabel("Management fee (%)").fill("15");
    const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/people");
    await pf.getByRole("button", { name: "Add property" }).click();
    await saved;
    await expect(page.getByTestId("properties-table").getByRole("row", { name: new RegExp(name) })).toBeVisible();
  }
  await page.goto("/import");
  await page.getByTestId("import-file-input").setInputFiles(`${FIXTURES}airbnb-style.csv`);
  await page.getByTestId("import-confirm").click();
  await expect(page.getByTestId("import-done-summary")).toContainText("22 bookings added");

  // no vault yet → can't run
  await page.getByTestId("nav-payouts").click();
  await expect(page.getByTestId("payouts-rehearsal")).toBeVisible();
  await expect(page.getByTestId("payouts-no-vault")).toBeVisible();
  await page.goto("/settings");
  await page.getByLabel("Vault account").fill("vault.houserules-operator.testnet");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("vault-saved")).toBeVisible();
  await approveAllPayees(page);

  await page.getByTestId("nav-payouts").click();
  await expect(page.getByTestId("metric-to-pay")).toContainText("21 bookings");
  await page.getByTestId("agent-run-button").click();
  const result = page.getByTestId("agent-run-result");
  await expect(result).toContainText("to 42 payees in 2 transactions"); // 40 + 2, bookings never split
  await expect(result).toHaveAttribute("data-status", "succeeded");
  await expect(result).toContainText("Simulated transaction");
  await expect(page.getByTestId("payouts-runs-table").locator("tbody tr")).toHaveCount(1);
  await expect(page.getByTestId("payouts-nothing")).toBeVisible();
  await expect(page.getByTestId("agent-run-button")).toBeDisabled();
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ caret: "initial", path: `${process.env.SCREENSHOT_DIR}/payouts.png`, fullPage: true });

  // bookings: 21 paid out, the $20-short one still blocked (never paid)
  await page.getByTestId("nav-bookings").click();
  await expect(page.locator('[data-testid^="booking-paid-"]')).toHaveCount(21);
  await expect(page.getByTestId("booking-row-airbnb-HM4009X")).toHaveAttribute("data-recon", "mismatch");
  await expect(page.getByTestId("booking-paid-HM4009X")).toHaveCount(0);

  // audit log: the vault's settle events (simulated in rehearsal) + what the operator did in the app
  await page.getByTestId("nav-audit").click();
  const feed = page.getByTestId("audit-feed");
  await expect(feed.locator('[data-kind="chain"]').filter({ hasText: "Paid $" })).toHaveCount(2); // one "settled" per tx
  await expect(feed.locator('[data-kind="chain"]').filter({ hasText: "Payout batch sent: 40 payouts" })).toHaveCount(1);
  await expect(feed).toContainText("Imported an Airbnb payout report: 22 bookings added");
  await expect(feed).toContainText("Connected vault vault.houserules-operator.testnet");
  await expect(feed).toContainText("Ran the payout agent: paid $");
  await page.getByTestId("audit-filter-chain").click();
  await expect(page.getByTestId("audit-feed").locator('[data-kind="app"]')).toHaveCount(0);
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ caret: "initial", path: `${process.env.SCREENSHOT_DIR}/audit.png`, fullPage: true });
});

test("/api/agent/run refuses anonymous callers and wrong scheduler secrets", async ({ request }) => {
  expect((await request.post("/api/agent/run")).status()).toBe(401);
  expect((await request.post("/api/agent/run", { headers: { "x-agent-secret": "x".repeat(40) } })).status()).toBe(401);
});
