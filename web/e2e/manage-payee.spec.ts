import { expect, test } from "@playwright/test";
import { addPayee, approveAllPayees, signUp } from "./helpers";

// Owner controls in rehearsal: change a payee's limit, remove a payee. Live, the same buttons ask
// the vault owner's wallet to sign (the calls are proven on a real vault in
// test/integration/owner-actions.sandbox.test.ts).

test("change a payee's limit and remove a payee; the vault's rules follow", async ({ page }) => {
  test.setTimeout(90_000);
  await signUp(page, "Casa Hosts");
  await page.goto("/people");
  await addPayee(page, { name: "Owen Reyes", role: "Property owner", account: "owen.testnet", cap: "800" });
  await addPayee(page, { name: "Maria Santos", role: "Cleaner", account: "maria.testnet", cap: "100" });
  await page.goto("/settings");
  await page.getByLabel("Vault account").fill("vault.casa.testnet");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("vault-saved")).toBeVisible();
  await approveAllPayees(page);

  const owen = page.getByTestId("payees-table").getByRole("row", { name: /Owen Reyes/ });
  const owenId = ((await owen.getAttribute("data-testid")) ?? "").replace("payee-row-", "");

  // bad input is refused with a reason; the dialog stays open
  await page.getByTestId(`payee-manage-${owenId}`).click();
  const dialog = page.getByTestId("payee-manage-dialog");
  await expect(dialog).toContainText("Manage Owen Reyes");
  await dialog.getByTestId("payee-cap-input").fill("abc");
  await dialog.getByTestId("payee-cap-save").click();
  await expect(dialog.getByTestId("payee-cap-error")).toContainText("Enter a dollar amount");

  // a new limit
  await dialog.getByTestId("payee-cap-input").fill("900");
  await dialog.getByTestId("payee-cap-save").click();
  await expect(dialog).toBeHidden();
  await expect(owen).toContainText("$900.00");

  // remove Maria (Keep backs out first)
  const maria = page.getByTestId("payees-table").getByRole("row", { name: /Maria Santos/ });
  const mariaId = ((await maria.getAttribute("data-testid")) ?? "").replace("payee-row-", "");
  await page.getByTestId(`payee-manage-${mariaId}`).click();
  await dialog.getByTestId("payee-remove").click();
  await dialog.getByTestId("payee-remove-cancel").click();
  await dialog.getByTestId("payee-remove").click();
  await dialog.getByTestId("payee-remove-confirm").click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId(`payee-status-${mariaId}`)).toHaveText("Removed");
  await expect(page.getByTestId(`payee-manage-${mariaId}`)).toHaveCount(0);

  // the vault's rules: Maria is off the list, Owen's new cap shows
  await page.getByTestId("nav-rules").click();
  await expect(page.getByTestId("rule-payee-maria.testnet")).toHaveCount(0);
  await expect(page.getByTestId("rule-payee-owen.testnet")).toContainText("$900.00");
  await expect(page.getByTestId("vault-controls-unavailable")).toContainText("Rehearsal");

  // the operator isn't stuck: the same account can be added back, and approved again
  await page.getByTestId("nav-people").click();
  await addPayee(page, { name: "Maria Santos", role: "Cleaner", account: "maria.testnet", cap: "120" });
  await expect(page.getByTestId(`payee-status-${mariaId}`)).toHaveText("Needs signature");
  await approveAllPayees(page);
  await expect(page.getByTestId(`payee-status-${mariaId}`)).toHaveText("Active");
  await expect(page.getByTestId("payees-table").getByRole("row", { name: /Maria Santos/ })).toContainText("$120.00");

  await page.getByTestId("nav-audit").click();
  await expect(page.getByTestId("audit-feed")).toContainText("Changed owen.testnet's limit from $800.00 to $900.00");
  await expect(page.getByTestId("audit-feed")).toContainText("Removed maria.testnet from the vault");
});

test("a property can move to someone else after its cleaner is removed", async ({ page }) => {
  test.setTimeout(90_000);
  await signUp(page, "Casa Hosts");
  await page.goto("/people");
  await addPayee(page, { name: "Owen Reyes", role: "Property owner", account: "owen.testnet", cap: "800" });
  await addPayee(page, { name: "Maria Santos", role: "Cleaner", account: "maria.testnet", cap: "100" });
  await addPayee(page, { name: "Nia Cruz", role: "Cleaner", account: "nia.testnet", cap: "100" });
  const pf = page.getByTestId("property-form");
  await pf.getByLabel("Property name").fill("Casa Azul");
  await pf.getByLabel("Owner").selectOption({ label: "Owen Reyes" });
  await pf.getByLabel("Cleaner").selectOption({ label: "Maria Santos" });
  await pf.getByLabel("Cleaning fee (USD)").fill("80");
  await pf.getByLabel("Management fee (%)").fill("15");
  await pf.getByRole("button", { name: "Add property" }).click();
  await expect(page.getByTestId("property-form-saved")).toBeVisible();

  const maria = page.getByTestId("payees-table").getByRole("row", { name: /Maria Santos/ });
  const mariaId = ((await maria.getAttribute("data-testid")) ?? "").replace("payee-row-", "");
  await page.getByTestId(`payee-manage-${mariaId}`).click();
  const manage = page.getByTestId("payee-manage-dialog");
  await manage.getByTestId("payee-remove").click();
  await manage.getByTestId("payee-remove-confirm").click();
  await expect(manage).toBeHidden();

  const row = page.getByTestId("properties-table").getByRole("row", { name: /Casa Azul/ });
  const propertyId = ((await row.getAttribute("data-testid")) ?? "").replace("property-row-", "");
  await page.getByTestId(`property-edit-${propertyId}`).click();
  const dialog = page.getByTestId("property-edit-dialog");
  await expect(dialog).toContainText("Who Casa Azul pays");
  // the removed cleaner isn't offered, so the role starts empty rather than silently keeping them
  await expect(dialog.getByTestId("property-edit-cleaner")).toHaveValue("");
  await expect(dialog.getByTestId("property-edit-cleaner").locator("option")).toHaveText(["Not set", "Nia Cruz"]);
  await dialog.getByTestId("property-edit-cleaner").selectOption({ label: "Nia Cruz" });
  await dialog.getByTestId("property-edit-save").click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText("Nia Cruz");
  await expect(row).toContainText("Owen Reyes");
});
