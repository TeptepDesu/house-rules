import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";
import { FIXTURES, addPayee, signUp } from "./helpers";

// Automated accessibility check (axe-core, WCAG 2.x A/AA) on every screen. Fails on serious or
// critical violations; prints the details so they can be fixed.

async function axe(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of bad) console.log(`[a11y] ${name}: ${v.id} (${v.impact}) ${v.help}\n  ${v.nodes.map((n) => `${n.target.join(" ")} :: ${n.any[0]?.message ?? ""}`).slice(0, 3).join("\n  ")}`);
  expect(bad.map((v) => `${name}: ${v.id}`)).toEqual([]);
}

test("no serious or critical accessibility violations", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await page.goto("/login");
  await axe(page, "login");
  await page.goto("/signup");
  await axe(page, "signup");

  await signUp(page, "Casa Hosts");
  await axe(page, "overview");
  await page.goto("/people");
  await addPayee(page, { name: "Owen Reyes", role: "Property owner", account: "owen.testnet", cap: "800" });
  await addPayee(page, { name: "Guy", role: "Property owner", account: "guy.near", cap: "10" }); // leaves an error state
  const pf = page.getByTestId("property-form");
  await pf.getByLabel("Property name").fill("Casa Azul");
  await pf.getByLabel("Owner").selectOption({ label: "Owen Reyes" });
  await pf.getByLabel("Cleaning fee (USD)").fill("80");
  await pf.getByLabel("Management fee (%)").fill("15");
  await pf.getByRole("button", { name: "Add property" }).click();
  await page.getByTestId("property-form-saved").waitFor();
  await axe(page, "people");
  await page.locator('[data-testid^="payee-manage-"]').first().click();
  await page.getByTestId("payee-manage-dialog").waitFor();
  await axe(page, "people-manage-dialog");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("payee-manage-dialog")).toBeHidden();

  await page.goto("/settings");
  await page.getByLabel("Vault account").fill("vault.casa.testnet");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByTestId("vault-saved").waitFor();
  await axe(page, "settings");

  await page.goto("/import");
  await axe(page, "import-empty");
  await page.getByTestId("import-file-input").setInputFiles(`${FIXTURES}airbnb-style.csv`);
  await page.getByTestId("import-preview-summary").waitFor();
  await axe(page, "import-preview");
  await page.getByTestId("import-confirm").click();
  await page.getByTestId("import-done").waitFor();

  for (const path of ["/bookings", "/invoices", "/payouts", "/rules", "/audit", "/"]) {
    await page.goto(path);
    await axe(page, path.slice(1) || "overview-with-data");
  }

  // guest pay page (no session)
  await page.goto("/invoices");
  const cf = page.getByTestId("charge-form");
  await cf.getByLabel("Booking").selectOption({ index: 1 });
  await cf.getByLabel("Description (the guest sees this)").fill("Late checkout fee");
  await cf.getByLabel("Amount (USD)").fill("45");
  await cf.getByRole("button", { name: "Create invoice" }).click();
  await page.getByTestId("charge-form-saved").waitFor();
  const id = ((await page.locator('[data-testid^="invoice-row-"]').first().getAttribute("data-testid")) ?? "").replace("invoice-row-", "");
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/pay/${id}`);
  await axe(guest, "pay-form");
  await guest.getByLabel("Your refund address").fill("0x0000000000000000000000000000000000000001");
  await guest.getByRole("button", { name: "Get payment address" }).click();
  await guest.getByTestId("pay-deposit").waitFor();
  await axe(guest, "pay-deposit");

  // mobile menu
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/bookings");
  await page.getByTestId("app-menu-toggle").click();
  await expect(page.getByTestId("nav-mobile-invoices")).toBeVisible();
  await axe(page, "mobile-menu-open");
});
