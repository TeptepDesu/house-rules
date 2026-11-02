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

  await page.getByTestId("nav-audit").click();
  await expect(page.getByTestId("audit-feed")).toContainText("Changed owen.testnet's limit from $800.00 to $900.00");
  await expect(page.getByTestId("audit-feed")).toContainText("Removed maria.testnet from the vault");
});
