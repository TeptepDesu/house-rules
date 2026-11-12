import { expect, test } from "@playwright/test";
import { DEV_SESSION_SECRET, SESSION_COOKIE, signSession } from "../lib/auth/token";
import { signUp } from "./helpers";

test("sign up → dashboard → sign out → sign in", async ({ page }) => {
  const { email, password } = await signUp(page, "Rina Operator");
  await expect(page.getByTestId("session-user-name")).toHaveText("Rina Operator");
  await expect(page.getByTestId("network-banner-testnet")).toContainText("Test mode");

  // desktop: Sign out lives in the avatar menu, under who's signed in
  // the button's name is its visible text (axe label-content-name-mismatch); it's announced as a menu button
  await page.getByRole("button", { name: "Rina Operator" }).click();
  await expect(page.getByTestId("session-user-email")).toHaveText(email);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("login-form-error")).toHaveText("Email or password is incorrect");
  await expect(page.getByLabel("Email")).toHaveValue(email); // kept after the error
  await expect(page.getByLabel("Password")).toHaveValue(""); // passwords are never echoed

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible({ timeout: 20_000 });
});

test("sign-up validation shows field errors", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("signup-name-error")).toBeVisible();
  await expect(page.getByTestId("signup-email-error")).toHaveText("Enter a valid email");
  await expect(page.getByTestId("signup-password-error")).toHaveText("Use at least 8 characters");
});

// Regression (2026-11-03): a cookie that's validly signed but names a user this database doesn't
// have (another local db shares localhost cookies and the dev secret) made proxy.ts and
// requireUser() bounce the browser between /login and / forever. Signing in was impossible.
test("a session for a user that no longer exists is cleared, not looped", async ({ page, context }) => {
  const token = await signSession(crypto.randomUUID(), DEV_SESSION_SECRET);
  await context.addCookies([{ name: SESSION_COOKIE, value: token, domain: "localhost", path: "/" }]);

  let navigations = 0;
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navigations++;
  });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500); // a loop would keep navigating here
  expect(navigations).toBeLessThan(6);
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).some((c) => c.name === SESSION_COOKIE)).toBe(false);

  await signUp(page, "Back In"); // and the app works normally afterwards
});

test("the session reset endpoint never signs out a real session", async ({ page }) => {
  await signUp(page, "Still Here");
  await page.goto("/api/auth/reset-session");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByTestId("session-user-name")).toHaveText("Still Here");
});
