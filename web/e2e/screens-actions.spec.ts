import { expect, test } from "@playwright/test";
import { FIXTURES, addPayee, approveAllPayees, signUp } from "./helpers";

// Design review captures of the operator's action screens (set SCREENSHOT_DIR). Not assertions,
// except that nothing overflows horizontally at phone width.
test.skip(!process.env.SCREENSHOT_DIR, "set SCREENSHOT_DIR to capture screens");

test("capture action screens at desktop and phone width", async ({ page }) => {
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
    // wait for the row, so the next property isn't typed into a form that's about to reset
    await expect(page.getByTestId("properties-table").getByRole("row", { name: new RegExp(name) })).toBeVisible();
  }
  await page.goto("/settings");
  await page.getByLabel("Vault account").fill("vault.casa.testnet");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("vault-saved")).toBeVisible();
  await approveAllPayees(page);
  await page.goto("/import");
  await page.getByTestId("import-file-input").setInputFiles(`${FIXTURES}airbnb-style.csv`);
  await page.getByTestId("import-confirm").click();
  await page.getByTestId("import-done").waitFor();
  await page.goto("/invoices");
  const cf = page.getByTestId("charge-form");
  await cf.getByLabel("Booking").selectOption({ index: 1 });
  await cf.getByLabel("Description (the guest sees this)").fill("Late checkout fee");
  await cf.getByLabel("Amount (USD)").fill("45");
  await cf.getByRole("button", { name: "Create invoice" }).click();
  await page.getByTestId("charge-form-saved").waitFor();

  for (const [w, h, tag] of [
    [1280, 800, "d"],
    [390, 844, "m"],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    const shoot = async (path: string, name: string, full = true) => {
      if (path) await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (tag === "m") {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${name} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      }
      await page.screenshot({ caret: "initial", path: `${dir}/${tag}-${name}.png`, fullPage: full });
    };
    await shoot("/bookings/new", "direct-booking");
    await shoot("/bookings", "bookings");
    await page.getByTestId("booking-accept-HM4009X").click();
    await shoot("", "bookings-accept-confirm");
    await shoot("/invoices", "invoices");
    await shoot("/people", "people");
    await page.locator('[data-testid^="payee-manage-"]').first().click();
    await page.getByTestId("payee-manage-dialog").waitFor();
    await page.waitForTimeout(300); // let the 100ms fade-in finish
    await shoot("", "manage-payee", false);
    await page.keyboard.press("Escape");
    await shoot("/rules", "rules");
  }
});
