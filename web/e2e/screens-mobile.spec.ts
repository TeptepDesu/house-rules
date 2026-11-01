import { expect, test } from "@playwright/test";
import { FIXTURES, addPayee, signUp } from "./helpers";

// Design review captures at phone width (set SCREENSHOT_DIR). Not assertions about layout, except
// that nothing overflows the viewport horizontally.
test.skip(!process.env.SCREENSHOT_DIR, "set SCREENSHOT_DIR to capture screens");

test("capture every screen at 390px", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const dir = process.env.SCREENSHOT_DIR!;
  await signUp(page, "Casa Hosts");
  await page.goto("/people");
  await addPayee(page, { name: "Owen Reyes", role: "Property owner", account: "owen.testnet", cap: "800" });
  await addPayee(page, { name: "Maria Santos", role: "Cleaner", account: "maria.testnet", cap: "100" });
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
  }
  await page.goto("/settings");
  await page.getByLabel("Vault account").fill("vault.casa.testnet");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("vault-saved")).toBeVisible();
  await page.goto("/import");
  await page.getByTestId("import-file-input").setInputFiles(`${FIXTURES}airbnb-style.csv`);
  await page.getByTestId("import-preview-summary").waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  const shoot = async (path: string, name: string) => {
    if (path) await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${name} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ caret: "initial", path: `${dir}/m-${name}.png`, fullPage: true });
  };
  await shoot("", "import-preview");
  await page.getByTestId("import-confirm").click();
  await page.getByTestId("import-done").waitFor();
  await shoot("/bookings", "bookings");
  await shoot("/payouts", "payouts");
  await page.getByTestId("agent-run-button").click();
  await page.getByTestId("agent-run-result").waitFor();
  await shoot("", "payouts-after-run");
  await shoot("/rules", "rules");
  await shoot("/audit", "audit");
  await shoot("/settings", "settings");
  await page.getByTestId("app-menu-toggle").click();
  await page.screenshot({ caret: "initial", path: `${dir}/m-menu-open.png` });

  // invoice + guest pay page
  await page.goto("/invoices");
  const cf = page.getByTestId("charge-form");
  await cf.getByLabel("Booking").selectOption({ index: 1 });
  await cf.getByLabel("Description (the guest sees this)").fill("Late checkout fee");
  await cf.getByLabel("Amount (USD)").fill("45");
  await cf.getByRole("button", { name: "Create invoice" }).click();
  await page.getByTestId("charge-form-saved").waitFor();
  await shoot("", "invoices");
  const id = ((await page.locator('[data-testid^="invoice-row-"]').first().getAttribute("data-testid")) ?? "").replace("invoice-row-", "");
  const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await guest.goto(`/pay/${id}`);
  await guest.getByLabel("Your refund address").fill("0x0000000000000000000000000000000000000001");
  await guest.getByRole("button", { name: "Get payment address" }).click();
  await guest.getByTestId("pay-deposit").waitFor();
  const overflow = await guest.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await guest.screenshot({ caret: "initial", path: `${dir}/m-pay.png`, fullPage: true });
});
