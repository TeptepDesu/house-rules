import { test } from "@playwright/test";
import { addPayee, signUp } from "./helpers";

// Not assertions: saves screenshots for design review when SCREENSHOT_DIR is set.
test.skip(!process.env.SCREENSHOT_DIR, "set SCREENSHOT_DIR to capture screens");

test("capture main screens", async ({ page }) => {
  const dir = process.env.SCREENSHOT_DIR!;
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto("/login");
  await page.screenshot({ caret: "initial", path: `${dir}/login.png` });
  await signUp(page);
  await page.screenshot({ caret: "initial", path: `${dir}/overview-empty.png` });
  await page.goto("/people");
  await addPayee(page, { name: "Owen Reyes", role: "Property owner", account: "houserules-owner-1.testnet", cap: "800" });
  await addPayee(page, { name: "Maria Santos", role: "Cleaner", account: "houserules-cleaner-1.testnet", cap: "100" });
  await addPayee(page, { name: "Guy", role: "Property owner", account: "guy.near", cap: "10" });
  await page.getByTestId("payee-account-error").waitFor();
  await page.screenshot({ caret: "initial", path: `${dir}/people.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ caret: "initial", path: `${dir}/people-mobile.png`, fullPage: true });
});
