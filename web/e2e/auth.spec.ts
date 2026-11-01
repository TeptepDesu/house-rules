import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("sign up → dashboard → sign out → sign in", async ({ page }) => {
  const { email, password } = await signUp(page, "Rina Operator");
  await expect(page.getByTestId("session-user-name")).toHaveText("Rina Operator");
  await expect(page.getByTestId("network-banner-testnet")).toContainText("Test mode");

  await page.getByRole("button", { name: "Sign out" }).click();
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
