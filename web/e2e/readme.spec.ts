import { expect, test } from "@playwright/test";
import { FIXTURES, addPayee, approveAllPayees } from "./helpers";

// Follows README.md "Try it in 5 minutes" step by step and checks what it says you'll see.
// If this fails, the README is wrong: fix the README (or the app), not this test.

test("README walkthrough", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const email = `readme.${Date.now()}@example.com`;

  // 1. sign up → Overview checklist
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Casa Hosts");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-9");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("setup-checklist")).toContainText("0 of 3 done");
  await expect(page.getByTestId("network-banner-testnet")).toContainText("Test mode · NEAR testnet");

  // 2. payees; guy.near refused on testnet
  await page.goto("/people");
  await addPayee(page, { name: "Owen", role: "Property owner", account: "owen.testnet", cap: "800" });
  await addPayee(page, { name: "Maria", role: "Cleaner", account: "maria.testnet", cap: "100" });
  await expect(page.getByTestId("payees-table")).toContainText("Needs signature");
  await addPayee(page, { name: "Guy", role: "Property owner", account: "guy.near", cap: "10" });
  await expect(page.getByTestId("payee-account-error")).toContainText("use a .testnet account");

  // 3. three properties
  const pf = page.getByTestId("property-form");
  for (const name of ["Casa Azul", "Loft 21", "Seaside Cottage"]) {
    await pf.getByLabel("Property name").fill(name);
    await pf.getByLabel("Owner").selectOption({ label: "Owen" });
    await pf.getByLabel("Cleaner").selectOption({ label: "Maria" });
    await pf.getByLabel("Cleaning fee (USD)").fill("80");
    await pf.getByLabel("Management fee (%)").fill("15");
    const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/people");
    await pf.getByRole("button", { name: "Add property" }).click();
    await saved;
    await expect(page.getByTestId("properties-table").getByRole("row", { name: new RegExp(name) })).toContainText("$80.00");
  }

  // 4–5. import → preview → bookings
  await page.getByTestId("nav-import").click();
  await page.getByTestId("import-file-input").setInputFiles(`${FIXTURES}airbnb-style.csv`);
  await expect(page.getByTestId("import-format")).toHaveText("Airbnb payout report");
  await expect(page.getByTestId("import-preview-summary")).toHaveText("22 will match, 2 flagged, 1 duplicate");
  await expect(page.getByTestId("import-preview")).toContainText("Not in USD");
  await expect(page.getByTestId("import-preview")).toContainText("Listing doesn't match any of your properties");
  await page.getByTestId("import-confirm").click();
  await page.getByTestId("import-done-bookings").click();
  await expect(page.locator('tr[data-recon="matched"]')).toHaveCount(21);
  await expect(page.getByTestId("booking-note-HM4009X")).toHaveText("Collected $474.70 vs expected $494.70 ($20.00 short)");

  // 6. vault
  await page.goto("/settings");
  await page.getByLabel("Vault account").fill("vault.yourname.testnet");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("vault-saved")).toHaveText("Saved. Guests can now pay invoices online.");

  // 7. approve both payees (rehearsal stand-in for signing add_payee with the operator's wallet)
  await approveAllPayees(page);
  await expect(page.getByTestId("payees-table")).not.toContainText("Needs signature");
  await page.getByTestId("nav-overview").click();
  await expect(page.getByTestId("overview-metrics")).toBeVisible();
  await expect(page.getByTestId("setup-checklist")).toHaveCount(0); // set up: the checklist steps aside

  // 8. charge Diego → booking held
  await page.goto("/invoices");
  const cf = page.getByTestId("charge-form");
  await cf.getByLabel("Booking").selectOption({ label: "Diego Santos · Casa Azul · Oct 4 – Oct 9" });
  await cf.getByLabel("Description (the guest sees this)").fill("Damage: broken lamp");
  await cf.getByLabel("Amount (USD)").fill("200");
  await cf.getByRole("button", { name: "Create invoice" }).click();
  await expect(page.getByTestId("charge-form-saved")).toBeVisible();
  const row = page.locator('[data-testid^="invoice-row-"]').filter({ hasText: "Damage: broken lamp" });
  const publicId = ((await row.getAttribute("data-testid")) ?? "").replace("invoice-row-", "");
  await page.goto("/bookings");
  await expect(page.getByTestId("booking-row-airbnb-HM4003X")).toHaveAttribute("data-recon", "open_penalty");

  // 9–10. guest pays
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/pay/${publicId}`);
  await guest.getByLabel("Pay with").selectOption({ label: "USDC on Arbitrum" });
  await guest.getByLabel("Your refund address").fill("0x0000000000000000000000000000000000000001");
  await guest.getByRole("button", { name: "Get payment address" }).click();
  await expect(guest.getByTestId("pay-deposit")).toContainText("Send exactly 201 USDC on Arbitrum");
  await expect(guest.getByTestId("pay-deposit")).toContainText("Casa Hosts receives exactly $200.00");
  await expect(guest.getByTestId("pay-status-pill")).toHaveText("Waiting for payment");
  await guest.getByTestId("pay-dev-simulate").click();
  await expect(guest.getByTestId("pay-confirmed")).toContainText("Payment received", { timeout: 15_000 });
  await page.goto("/invoices");
  await expect(page.getByTestId(`invoice-row-status-${publicId}`)).toHaveText("Paid");
  await page.goto("/bookings");
  await expect(page.getByTestId("booking-row-airbnb-HM4003X")).toHaveAttribute("data-recon", "matched");

  // 11. run agent: the $200 damage payment pushes Diego's owner payout over Owen's $800 cap
  await page.goto("/payouts");
  await page.getByTestId("agent-run-button").click();
  const result = page.getByTestId("agent-run-result");
  await expect(result).toContainText("Paid $9,917.37 to 40 payees in 1 transaction.");
  await expect(result).toContainText("2 payouts held back.");
  const held = page.getByTestId("payouts-held");
  await expect(held).toContainText("Owen · Owner for Diego Santos");
  await expect(held).toContainText("Above this payee's per-payout limit");
  await expect(held).toContainText("$816.85");
  await expect(held).toContainText("Held with the rest of this booking");
  await expect(held).toContainText("$60.00");

  // 12–13. rules + audit
  await page.goto("/rules");
  for (const t of ["Pays only these 2 people", "At most $800.00 per payout", "Up to $20,000.00 per day", "New payees wait 24 hours", "Each booking is paid once", "The agent can only call settle"]) {
    await expect(page.locator("main")).toContainText(t);
  }
  await page.goto("/audit");
  await expect(page.getByTestId("audit-feed")).toContainText("Payout batch sent: 40 payouts, $9,917.37");
  await expect(page.getByTestId("audit-feed")).toContainText("Paid $9,917.37 in 40 payouts");

  // 14. overview dashboard
  await page.getByTestId("nav-overview").click();
  await expect(page.getByTestId("overview-metric-collected")).toContainText("$12,877.30");
  await expect(page.getByTestId("setup-checklist")).toHaveCount(0); // after the content loaded
  await expect(page.getByTestId("overview-metric-ready")).toContainText("$0.00");
  await expect(page.getByTestId("overview-metric-paid")).toContainText("$9,917.37");
  await expect(page.getByTestId("overview-metric-paid")).toContainText("in 1 run");
  await expect(page.getByTestId("overview-metric-attention")).toContainText("3");
  const attention = page.getByTestId("overview-attention");
  await expect(attention).toContainText("($20.00 short)");
  await expect(attention).toContainText("Owen for Diego Santos");
  await expect(attention).toContainText("Above this payee's per-payout limit · $816.85");
});
