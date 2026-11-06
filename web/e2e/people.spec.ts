import { expect, test } from "@playwright/test";
import { addPayee, signUp } from "./helpers";

test("operator sets up payees and a property; overview checklist follows", async ({ page }) => {
  await signUp(page);
  await expect(page.getByTestId("setup-step-payees")).toHaveAttribute("data-done", "false");
  await page.getByTestId("setup-step-payees-cta").click();
  await expect(page.getByRole("heading", { name: "Homes & people" })).toBeVisible();
  await expect(page.getByTestId("payees-empty")).toBeVisible();

  await addPayee(page, { name: "Owen Reyes", role: "Property owner", account: "houserules-owner-1.testnet", cap: "800" });
  await expect(page.getByTestId("payee-form-saved")).toBeVisible();
  await addPayee(page, { name: "Maria Santos", role: "Cleaner", account: "HouseRules-Cleaner-1.testnet ", cap: "100.50" });

  const table = page.getByTestId("payees-table");
  await expect(table.getByRole("row")).toHaveCount(3); // header + 2
  const maria = table.getByRole("row", { name: /Maria Santos/ });
  await expect(maria).toContainText("houserules-cleaner-1.testnet"); // normalised
  await expect(maria).toContainText("$100.50");
  await expect(maria).toContainText("Needs signature");

  // validation: mainnet account on a testnet deployment, duplicate, empty fields
  await addPayee(page, { name: "Guy", role: "Property owner", account: "guy.near", cap: "10" });
  await expect(page.getByTestId("payee-account-error")).toHaveText("This app is on testnet: use a .testnet account");
  await expect(page.getByTestId("payee-form").getByLabel("Name")).toHaveValue("Guy"); // input kept
  await addPayee(page, { name: "Dup", role: "Property owner", account: "houserules-owner-1.testnet", cap: "10" });
  await expect(page.getByTestId("payee-account-error")).toHaveText("You've already added this account");
  await addPayee(page, { name: "", role: "Cleaner", account: "x.testnet", cap: "0" });
  await expect(page.getByTestId("payee-name-error")).toBeVisible();
  await expect(page.getByTestId("payee-cap-error")).toBeVisible();

  // property: dropdowns only offer the right role
  const pf = page.getByTestId("property-form");
  await expect(pf.getByLabel("Owner").locator("option")).toHaveText(["Not set", "Owen Reyes"]);
  await expect(pf.getByLabel("Cleaner").locator("option")).toHaveText(["Not set", "Maria Santos"]);
  await pf.getByLabel("Property name").fill("Casa Azul");
  await pf.getByLabel("Owner").selectOption({ label: "Owen Reyes" });
  await pf.getByLabel("Cleaner").selectOption({ label: "Maria Santos" });
  await pf.getByLabel("Cleaning fee (USD)").fill("80");
  await pf.getByLabel("Management fee (%)").fill("150");
  await pf.getByRole("button", { name: "Add property" }).click();
  await expect(page.getByTestId("property-mgmt-fee-error")).toBeVisible();
  // regression: React 19 resets forms after an action; typed values must survive a validation error
  await expect(pf.getByLabel("Property name")).toHaveValue("Casa Azul");
  await expect(pf.getByLabel("Owner").locator("option:checked")).toHaveText("Owen Reyes");
  await expect(pf.getByLabel("Cleaning fee (USD)")).toHaveValue("80");
  await pf.getByLabel("Management fee (%)").fill("15");
  await pf.getByRole("button", { name: "Add property" }).click();
  await expect(page.getByTestId("property-form-saved")).toBeVisible();
  const row = page.getByTestId("properties-table").getByRole("row", { name: /Casa Azul/ });
  await expect(row).toContainText("Owen Reyes");
  await expect(row).toContainText("$80.00");
  await expect(row).toContainText("15%");

  await page.getByTestId("nav-overview").click();
  await expect(page.getByTestId("setup-step-payees")).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("setup-step-sign")).toHaveAttribute("data-done", "false");
  await expect(page.getByTestId("setup-step-properties")).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("setup-step-sign-cta")).toBeVisible();
});

test("RBAC: one operator never sees another's payees", async ({ browser }) => {
  const a = await browser.newContext();
  const pa = await a.newPage();
  await signUp(pa, "Operator A");
  await pa.goto("/people");
  await addPayee(pa, { name: "Secret Owner", role: "Property owner", account: "secret-owner.testnet", cap: "500" });
  await expect(pa.getByTestId("payee-form-saved")).toBeVisible();

  const b = await browser.newContext();
  const pb = await b.newPage();
  await signUp(pb, "Operator B");
  await pb.goto("/people");
  await expect(pb.getByTestId("payees-empty")).toBeVisible();
  await expect(pb.getByText("Secret Owner")).toHaveCount(0);
  await expect(pb.getByTestId("property-form").getByLabel("Owner").locator("option")).toHaveText(["Not set"]);
  await a.close();
  await b.close();
});
