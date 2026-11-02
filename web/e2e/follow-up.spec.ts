import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { FIXTURES, addProperty, signUp } from "./helpers";

// A blocked booking (open damage claim) gets a ready-to-send guest message with the exact amount
// and the real pay link. Nothing is sent from the app. NEAR AI is off here (no key), so there's no
// "Polish" button.

test("message the guest about an open charge: exact amount, real pay link, nothing sent", async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signUp(page, "Casa Hosts");
  await page.goto("/people");
  for (const p of ["Casa Azul", "Loft 21", "Seaside Cottage"]) await addProperty(page, p);
  await page.goto("/import");
  await page.getByTestId("import-file-input").setInputFiles(`${FIXTURES}airbnb-style.csv`);
  await page.getByTestId("import-confirm").click();
  await expect(page.getByTestId("import-done-summary")).toContainText("22 bookings added");

  await page.getByTestId("nav-invoices").click();
  const form = page.getByTestId("charge-form");
  await form.getByLabel("Booking").selectOption({ label: "Diego Santos · Casa Azul · Oct 4 – Oct 9" });
  await form.getByLabel("Description (the guest sees this)").fill("Damage: broken lamp");
  await form.getByLabel("Amount (USD)").fill("200");
  await form.getByRole("button", { name: "Create invoice" }).click();
  await expect(page.getByTestId("charge-form-saved")).toBeVisible();
  const row = page.locator('[data-testid^="invoice-row-"]').filter({ hasText: "Damage: broken lamp" });
  const publicId = ((await row.getAttribute("data-testid")) ?? "").replace("invoice-row-", "");

  await page.getByTestId("nav-bookings").click();
  await expect(page.getByTestId("booking-followup-HM4009X")).toHaveCount(0); // a channel shortfall isn't the guest's to pay
  await page.getByTestId("booking-followup-HM4003X").click();
  const dialog = page.getByTestId("followup-dialog");
  await expect(dialog.getByTestId("followup-subject")).toHaveValue("Casa Hosts: $200.00 for your stay at Casa Azul");
  const body = dialog.getByTestId("followup-body");
  await expect(body).toHaveValue(/^Hi Diego,/);
  await expect(body).toHaveValue(/Damage: broken lamp, \$200\.00\./);
  const origin = new URL(page.url()).origin;
  await expect(body).toHaveValue(new RegExp(`${origin}/pay/${publicId}`.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")));
  await expect(body).not.toHaveValue(/\{PAY_LINK\}/);
  await expect(dialog.getByTestId("followup-polish")).toHaveCount(0);

  const scan = await new AxeBuilder({ page }).include('[data-testid="followup-dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(scan.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

  await dialog.getByTestId("followup-copy").click();
  await expect(dialog.getByTestId("followup-copy")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`Casa Hosts: $200.00 for your stay at Casa Azul\n\nHi Diego,`);
});
