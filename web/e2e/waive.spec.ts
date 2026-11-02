import { expect, test } from "@playwright/test";
import { FIXTURES, addProperty, signUp } from "./helpers";

// The operator forgives a damage charge: the booking stops being blocked, the audit log says so,
// and the invoice can no longer be paid.

test("waiving an open charge unblocks the booking and closes the invoice", async ({ page, browser }) => {
  test.setTimeout(90_000);
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
  await form.getByLabel("Description (the guest sees this)").fill("Late checkout");
  await form.getByLabel("Amount (USD)").fill("45");
  await form.getByRole("button", { name: "Create invoice" }).click();
  await expect(page.getByTestId("charge-form-saved")).toBeVisible();
  const row = page.locator('[data-testid^="invoice-row-"]').filter({ hasText: "Late checkout" });
  const publicId = ((await row.getAttribute("data-testid")) ?? "").replace("invoice-row-", "");

  await page.getByTestId("nav-bookings").click();
  await expect(page.getByTestId("booking-row-airbnb-HM4003X")).toHaveAttribute("data-recon", "open_penalty");

  // Waive → confirm (Keep backs out first)
  await page.getByTestId("nav-invoices").click();
  await page.getByTestId(`invoice-waive-${publicId}`).click();
  await expect(page.getByTestId(`invoice-waive-confirm-${publicId}`)).toContainText("Waive $45.00?");
  await page.getByTestId(`invoice-waive-cancel-${publicId}`).click();
  await expect(page.getByTestId(`invoice-row-status-${publicId}`)).toHaveText("Open");
  await page.getByTestId(`invoice-waive-${publicId}`).click();
  await page.getByTestId(`invoice-waive-yes-${publicId}`).click();
  await expect(page.getByTestId(`invoice-row-status-${publicId}`)).toHaveText("Waived");
  await expect(page.getByTestId(`invoice-waive-${publicId}`)).toHaveCount(0);

  await page.getByTestId("nav-bookings").click();
  await expect(page.getByTestId("booking-row-airbnb-HM4003X")).toHaveAttribute("data-recon", "matched");

  await page.getByTestId("nav-audit").click();
  await expect(page.getByTestId("audit-feed")).toContainText("Waived a $45.00 charge: Late checkout");

  // the guest's link no longer takes payment
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/pay/${publicId}`);
  await expect(guest.getByTestId("pay-waived")).toContainText("Casa Hosts waived this charge. You don't owe anything.");
  await expect(guest.getByRole("button", { name: "Get payment address" })).toHaveCount(0);
});
