import { expect, test } from "@playwright/test";
import { FIXTURES, addProperty, signUp } from "./helpers";

// A channel paid $20 less than its own report says it should (e.g. a resolution adjustment). The
// operator accepts what arrived as final: the booking unblocks and splits on $474.70.

test("accepting a short payout unblocks the booking; the audit log records the decision", async ({ page }) => {
  test.setTimeout(90_000);
  await signUp(page, "Casa Hosts");
  await page.goto("/people");
  for (const p of ["Casa Azul", "Loft 21", "Seaside Cottage"]) await addProperty(page, p);
  await page.goto("/import");
  await page.getByTestId("import-file-input").setInputFiles(`${FIXTURES}airbnb-style.csv`);
  await page.getByTestId("import-confirm").click();
  await expect(page.getByTestId("import-done-summary")).toContainText("22 bookings added");

  await page.getByTestId("nav-bookings").click();
  const row = page.getByTestId("booking-row-airbnb-HM4009X");
  await expect(row).toHaveAttribute("data-recon", "mismatch");
  await page.getByTestId("booking-accept-HM4009X").click();
  await expect(page.getByTestId("booking-accept-confirm-HM4009X")).toContainText("Treat $474.70 as final?");
  await page.getByTestId("booking-accept-cancel-HM4009X").click();
  await expect(row).toHaveAttribute("data-recon", "mismatch");

  await page.getByTestId("booking-accept-HM4009X").click();
  await page.getByTestId("booking-accept-yes-HM4009X").click();
  await expect(row).toHaveAttribute("data-recon", "matched");
  await expect(page.getByTestId("booking-accept-HM4009X")).toHaveCount(0);

  await page.getByTestId("nav-audit").click();
  await expect(page.getByTestId("audit-feed")).toContainText("Accepted $474.70 as final for a booking ($20.00 short)");
});
