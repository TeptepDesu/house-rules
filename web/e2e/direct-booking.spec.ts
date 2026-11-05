import { expect, test } from "@playwright/test";
import { addPayee, approveAllPayees, signUp } from "./helpers";

// Plan §1 "Collect": a guest who booked directly pays the stay from another chain; exact USDC lands
// in the vault; the booking reconciles and the agent pays the owner and cleaner from it.

test("direct booking → guest pays from another chain → reconciled → paid out", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await signUp(page, "Casa Hosts");
  await page.goto("/people");
  await addPayee(page, { name: "Owen Reyes", role: "Property owner", account: "owen.testnet", cap: "800" });
  await addPayee(page, { name: "Maria Santos", role: "Cleaner", account: "maria.testnet", cap: "100" });
  const pf = page.getByTestId("property-form");
  await pf.getByLabel("Property name").fill("Casa Azul");
  await pf.getByLabel("Owner").selectOption({ label: "Owen Reyes" });
  await pf.getByLabel("Cleaner").selectOption({ label: "Maria Santos" });
  await pf.getByLabel("Cleaning fee (USD)").fill("80");
  await pf.getByLabel("Management fee (%)").fill("15");
  await pf.getByRole("button", { name: "Add property" }).click();
  await expect(page.getByTestId("property-form-saved")).toBeVisible();
  await page.goto("/settings");
  await page.getByLabel("Vault account").fill("vault.casa.testnet");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("vault-saved")).toBeVisible();
  await approveAllPayees(page);

  // new direct booking: validation first, values kept
  await page.getByTestId("nav-bookings").click();
  await page.getByTestId("bookings-new-direct").click();
  const form = page.getByTestId("direct-booking-form");
  await form.getByLabel("Guest name").fill("Lena Park");
  await form.getByLabel("Property").selectOption({ label: "Casa Azul" });
  await form.getByLabel("Check-in").fill("2026-10-20");
  await form.getByLabel("Check-out").fill("2026-10-18");
  await form.getByLabel("Total for the stay (USD)").fill("600");
  await page.getByTestId("direct-booking-submit").click();
  await expect(page.getByTestId("direct-checkout-error")).toHaveText("Check-out must be after check-in");
  await expect(form.getByLabel("Guest name")).toHaveValue("Lena Park");
  await form.getByLabel("Check-out").fill("2026-10-23");
  await form.getByLabel("Guest pays by").fill("2026-10-24");
  await page.getByTestId("direct-booking-submit").click();
  const created = page.getByTestId("direct-booking-created");
  await expect(created).toContainText("created for Lena Park");
  await expect(created).toContainText("$600.00");
  const href = (await page.getByTestId("direct-booking-open").getAttribute("href"))!;
  const publicId = href.replace("/pay/", "");

  // on Bookings: the pay-by date has passed and nothing has arrived, so it's unpaid (blocked)
  await page.getByTestId("direct-booking-done").click();
  const ref = (await page.locator('[data-testid^="booking-row-direct-"]').getAttribute("data-testid"))!.replace("booking-row-direct-", "");
  // the stay itself can't be waived: reconciliation still expects it
  await page.getByTestId("nav-invoices").click();
  await expect(page.getByTestId(`invoice-row-${publicId}`)).toBeVisible();
  await expect(page.getByTestId(`invoice-waive-${publicId}`)).toHaveCount(0);
  await page.getByTestId("nav-bookings").click();
  await expect(page.getByTestId(`booking-row-direct-${ref}`)).toHaveAttribute("data-recon", "unpaid");
  await expect(page.getByTestId(`booking-note-${ref}`)).toHaveText("Nothing collected; due Oct 24, 2026");

  // the guest pays from Arbitrum
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/pay/${publicId}`);
  await expect(guest.getByTestId("pay-amount")).toHaveText("$600.00");
  await expect(guest.getByTestId("pay-description")).toHaveText("Stay at Casa Azul, Oct 20 – Oct 23");
  await guest.getByLabel("Pay with").selectOption({ label: "USDC on Arbitrum" });
  await guest.getByLabel("Your refund address").fill("0x0000000000000000000000000000000000000001");
  await guest.getByRole("button", { name: "Get payment address" }).click();
  await guest.getByTestId("pay-dev-simulate").click();
  await expect(guest.getByTestId("pay-confirmed")).toContainText("$600.00 reached Casa Hosts", { timeout: 15_000 });

  // reconciled → the agent pays: cleaner $80, owner (600 − 80) × 85% = $442.00
  await page.reload();
  await expect(page.getByTestId(`booking-row-direct-${ref}`)).toHaveAttribute("data-recon", "matched");
  await page.getByTestId("nav-payouts").click();
  await page.getByTestId("agent-run-button").click();
  await expect(page.getByTestId("agent-run-result")).toContainText("Paid $522.00 to 2 payees in 1 transaction.");

  await page.getByTestId("nav-audit").click();
  await expect(page.getByTestId("audit-feed")).toContainText(`Created direct booking ${ref} and its $600.00 invoice`);
});
