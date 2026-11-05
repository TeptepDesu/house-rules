import { type Page, expect, test } from "@playwright/test";
import { signUp } from "./helpers";

// Dark by default; the sun/moon toggle switches to light and the choice survives reloads and
// sign-in, with no flash of the wrong theme and no hydration error.

const html = (page: Page) => page.locator("html");

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("dark by default, toggle to light, remembered across reloads and sign-in", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/login");
  await expect(html(page)).toHaveClass(/\bdark\b/);
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();

  await page.getByTestId("auth-theme-toggle").click();
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
  await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();

  // a full reload applies the saved choice before paint: the first HTML already lacks `dark`
  await page.reload();
  await expect(html(page)).not.toHaveClass(/\bdark\b/);

  await signUp(page);
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
  await page.getByTestId("theme-toggle").click();
  await expect(html(page)).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(html(page)).toHaveClass(/\bdark\b/);

  expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
});

test("the background really changes with the theme", async ({ page }) => {
  await page.goto("/login");
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dark = await bg();
  await page.getByTestId("auth-theme-toggle").click();
  const light = await bg();
  expect(dark).not.toEqual(light);
});

test("phone: the theme switch is in the menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page);
  await page.getByTestId("app-menu-toggle").click();
  await page.getByTestId("theme-toggle-mobile").click();
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
});

test("an unknown address gets our own 404 in the app's theme, and the site has its own icon", async ({ page }) => {
  // the pay page streams inside <Suspense>, so Next keeps HTTP 200 and marks the page noindex
  await page.goto("/pay/not-a-real-invoice");
  await expect(page.getByTestId("not-found")).toBeVisible();
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", /icon/);
});
