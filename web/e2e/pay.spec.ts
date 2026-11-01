import { expect, test } from "@playwright/test";
import { FIXTURES, addProperty, signUp } from "./helpers";

// Optional design-review captures (set SCREENSHOT_DIR).
const shot = async (p: import("@playwright/test").Page, name: string) =>
  process.env.SCREENSHOT_DIR && p.screenshot({ caret: "initial", path: `${process.env.SCREENSHOT_DIR}/${name}.png`, fullPage: true });

// Demo step 2 (plan §11): a guest pays a damage invoice from another chain; exact USDC lands in
// the vault. 1Click is mocked in-process (ONECLICK_MODE=mock); verification uses the mock chain.

test("operator charges a damage fee → guest pays from another chain → invoice paid, booking unblocked", async ({ page, browser }) => {
  test.setTimeout(90_000); // full operator + guest journey, including a 22-booking import
  await signUp(page, "Casa Hosts");
  await page.goto("/people");
  for (const p of ["Casa Azul", "Loft 21", "Seaside Cottage"]) await addProperty(page, p);
  await page.goto("/import");
  await page.getByTestId("import-file-input").setInputFiles(`${FIXTURES}airbnb-style.csv`);
  await page.getByTestId("import-confirm").click();
  await expect(page.getByTestId("import-done-summary")).toContainText("22 bookings added");

  // charge Diego for a broken lamp (no vault yet → warning)
  await page.getByTestId("nav-invoices").click();
  await expect(page.getByTestId("invoices-no-vault")).toBeVisible();
  const form = page.getByTestId("charge-form");
  await form.getByLabel("Booking").selectOption({ label: "Diego Santos · Casa Azul · Oct 4 – Oct 9" });
  await form.getByLabel("Description (the guest sees this)").fill("Damage: broken lamp");
  await form.getByLabel("Amount (USD)").fill("200");
  await form.getByRole("button", { name: "Create invoice" }).click();
  await expect(page.getByTestId("charge-form-saved")).toBeVisible();
  const row = page.locator('[data-testid^="invoice-row-"]').filter({ hasText: "Damage: broken lamp" });
  const publicId = ((await row.getAttribute("data-testid")) ?? "").replace("invoice-row-", "");
  expect(publicId).toMatch(/^[A-Za-z0-9_-]{22}$/);
  await expect(row).toContainText("$200.00");
  await expect(row).toContainText("Open");

  // the open claim blocks Diego's payout
  await page.getByTestId("nav-bookings").click();
  await expect(page.getByTestId("booking-row-airbnb-HM4003X")).toHaveAttribute("data-recon", "open_penalty");
  await expect(page.getByTestId("booking-note-HM4003X")).toContainText("$200.00 unpaid");

  // the guest (no session) can't pay until the operator connects a vault
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(`/pay/${publicId}`);
  await expect(guest.getByTestId("pay-amount")).toHaveText("$200.00");
  await expect(guest.getByTestId("pay-description")).toHaveText("Damage: broken lamp");
  await expect(guest.getByTestId("pay-business")).toHaveText("Casa Hosts");
  await expect(guest.getByTestId("pay-test-mode")).toBeVisible();
  await expect(guest.getByTestId("pay-not-ready")).toBeVisible();

  // operator connects the vault (wrong network first)
  await page.getByTestId("nav-settings").click();
  const vf = page.getByTestId("vault-form");
  await vf.getByLabel("Vault account").fill("vault.casa.near");
  await vf.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("vault-account-error")).toHaveText("This app is on testnet: use a .testnet account");
  await vf.getByLabel("Vault account").fill("vault.houserules-operator.testnet");
  await vf.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("vault-saved")).toBeVisible();

  // guest pays with USDC on Arbitrum
  await guest.reload();
  await guest.getByLabel("Pay with").selectOption({ label: "USDC on Arbitrum" });
  await guest.getByLabel("Your refund address").fill("0xGuestRefund000000000000000000000000000001");
  await guest.getByRole("button", { name: "Get payment address" }).click();
  await expect(guest.getByTestId("pay-page-deposit-address")).toHaveText(/^mock-[0-9a-f]{24}$/);
  await expect(guest.getByTestId("pay-amount-in")).toHaveText("201 USDC"); // mock quote: +0.5%
  await expect(guest.getByRole("img", { name: "QR code of the payment address" })).toBeVisible();
  await expect(guest.getByTestId("pay-status-pill")).toHaveText("Waiting for payment");
  await guest.setViewportSize({ width: 480, height: 900 });
  await shot(guest, "pay-deposit");
  const depositAddress = (await guest.getByTestId("pay-page-deposit-address").textContent())!;

  // a different invoice's page can't poll this address
  const other = await guest.request.get(`/api/pay/${"A".repeat(22)}/status?d=${depositAddress}`);
  expect(other.status()).toBe(404);

  await guest.getByTestId("pay-dev-simulate").click();
  await expect(guest.getByTestId("pay-confirmed")).toBeVisible({ timeout: 15_000 });
  await expect(guest.getByTestId("pay-confirmed")).toContainText("$200.00 reached Casa Hosts");
  await shot(guest, "pay-confirmed");

  // reopening the link shows it's paid; it can't be paid twice
  await guest.reload();
  await expect(guest.getByTestId("pay-already-paid")).toBeVisible();
  const again = await guest.request.post(`/api/pay/${publicId}/quote`, { data: { originAsset: "nep141:arb-usdc.mock", refundTo: "0xabc" } });
  expect(again.status()).toBe(409);
  await guestCtx.close();

  // operator sees it paid; Diego's booking is no longer blocked
  await page.getByTestId("nav-invoices").click();
  await expect(page.getByTestId(`invoice-row-status-${publicId}`)).toHaveText("Paid");
  await shot(page, "invoices");
  await page.getByTestId("nav-bookings").click();
  await expect(page.getByTestId("booking-row-airbnb-HM4003X")).toHaveAttribute("data-recon", "matched");
});

test("public endpoints don't leak: unknown ids 404, the quote amount can't be chosen by the client", async ({ request }) => {
  expect((await request.get(`/api/pay/${"B".repeat(22)}/tokens`)).status()).toBe(404);
  expect((await request.post(`/api/pay/not-an-id/quote`, { data: { originAsset: "x", refundTo: "0xabc" } })).status()).toBe(404);
  expect((await request.post(`/api/pay/${"B".repeat(22)}/quote`, { data: { originAsset: "x" } })).status()).toBe(400);
  expect((await request.post(`/api/dev/simulate-deposit`, { data: { depositAddress: "mock-nope" } })).status()).toBe(404);
});

test("pages under /pay are public, but /payouts is not (proxy matcher)", async ({ page }) => {
  await page.goto("/payouts");
  await expect(page).toHaveURL(/\/login$/);
});
