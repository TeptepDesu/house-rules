import { expect, test } from "@playwright/test";
import { FIXTURES, addProperty, signUp } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signUp(page);
  await page.goto("/people");
  for (const p of ["Casa Azul", "Loft 21", "Seaside Cottage"]) await addProperty(page, p);
});

test("demo step 3: drop an Airbnb report → 22 match, 2 flagged, 1 duplicate → bookings reconciled", async ({ page }) => {
  await page.getByTestId("nav-import").click();
  await page.getByTestId("import-file-input").setInputFiles(`${FIXTURES}airbnb-style.csv`);

  await expect(page.getByTestId("import-preview-summary")).toHaveText("22 will match, 2 flagged, 1 duplicate");
  await expect(page.getByTestId("import-format")).toHaveText("Airbnb payout report");
  const flagged = page.locator('tr[data-status="flagged"]');
  await expect(flagged).toHaveCount(2);
  await expect(flagged.filter({ hasText: "HM4006X" })).toContainText("Not in USD");
  await expect(flagged.filter({ hasText: "HM4017X" })).toContainText("Listing doesn't match any of your properties");
  await expect(page.locator('tr[data-status="duplicate"]')).toHaveCount(1);
  await expect(page.getByTestId("import-ignored-note")).toContainText("2 rows skipped");

  await page.getByTestId("import-confirm").click();
  await expect(page.getByTestId("import-done-summary")).toContainText("22 bookings added");
  await page.getByTestId("import-done-bookings").click();

  await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
  await expect(page.getByTestId("bookings-table").locator("tbody tr")).toHaveCount(22);
  await expect(page.getByTestId("metric-blocked")).toContainText("1");
  const blocked = page.getByTestId("booking-row-airbnb-HM4009X");
  await expect(blocked).toHaveAttribute("data-recon", "mismatch");
  await expect(page.getByTestId("booking-note-HM4009X")).toContainText("$20.00 short");
  // blocked rows are listed first
  await expect(page.getByTestId("bookings-table").locator("tbody tr").first()).toHaveAttribute("data-testid", "booking-row-airbnb-HM4009X");

  // importing the same file again changes nothing
  await page.goto("/import");
  await page.getByTestId("import-file-input").setInputFiles(`${FIXTURES}airbnb-style.csv`);
  await expect(page.getByTestId("import-preview-summary")).toHaveText("0 will match, 2 flagged, 23 duplicates");
  await expect(page.getByTestId("import-confirm")).toBeDisabled();
  await expect(page.getByTestId("import-confirm")).toHaveText("Nothing new to import");
});

test("unknown format → map the columns → preview", async ({ page }) => {
  await page.goto("/import");
  await page.getByTestId("import-file-input").setInputFiles({
    name: "custom.csv",
    mimeType: "text/csv",
    buffer: Buffer.from('Ref,Arrive,Leave,Who,Unit,Net $\nX-1,2026-10-01,2026-10-03,Kai Lee,Loft 21,"1,200.00"\n'),
  });
  const form = page.getByTestId("import-mapping-form");
  await expect(form).toBeVisible();
  for (const [field, col] of [
    ["Booking reference", "Ref"],
    ["Guest", "Who"],
    ["Listing / property", "Unit"],
    ["Check-in", "Arrive"],
    ["Check-out", "Leave"],
    ["Payout (USD)", "Net $"],
  ]) {
    await form.getByLabel(field, { exact: true }).selectOption(col);
  }
  await form.getByRole("button", { name: "Preview with these columns" }).click();
  await expect(page.getByTestId("import-preview-summary")).toHaveText("1 will match, 0 flagged, 0 duplicates");
  await expect(page.getByTestId("import-preview-table")).toContainText("$1,200.00");
});

test("not a CSV / empty file → clear error, nothing saved", async ({ page }) => {
  await page.goto("/import");
  await page.getByTestId("import-file-input").setInputFiles({ name: "empty.csv", mimeType: "text/csv", buffer: Buffer.from("just,a,header\n") });
  await expect(page.getByTestId("import-error")).toHaveText("The file has no rows to import.");
  await page.goto("/bookings");
  await expect(page.getByTestId("bookings-empty")).toBeVisible();
});
