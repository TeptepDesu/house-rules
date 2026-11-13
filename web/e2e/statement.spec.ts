import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";
import { FIXTURES, addPayee, approveAllPayees, signUp } from "./helpers";

// Payee statements: the owner's and cleaner's own view of their payouts, opened from the link the
// operator copies on Homes & people. Same setup as the demo video, in rehearsal.

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

async function copyStatementLink(page: Page, name: string): Promise<string> {
  await page.goto("/people");
  const row = page.getByTestId("payees-table").getByRole("row").filter({ hasText: name });
  await row.locator('[data-testid^="payee-statement-link-"]').click();
  await expect(row.locator('[data-testid^="payee-statement-link-"]')).toContainText("Link copied");
  return page.evaluate(() => navigator.clipboard.readText());
}

test("owner and cleaner each see what they were paid, what's held and why, without signing in", async ({ page, browser }) => {
  test.setTimeout(150_000);
  await signUp(page, "Casa Hosts");
  await page.goto("/people");
  await addPayee(page, { name: "Owen Marsh", role: "Property owner", account: "owen.testnet", cap: "7" });
  await addPayee(page, { name: "Maria Lopez", role: "Cleaner", account: "maria.testnet", cap: "2" });
  const pf = page.getByTestId("property-form");
  for (const name of ["Casa Azul", "Loft 21", "Seaside Cottage"]) {
    await pf.getByLabel("Property name").fill(name);
    await pf.getByLabel("Owner").selectOption({ label: "Owen Marsh" });
    await pf.getByLabel("Cleaner").selectOption({ label: "Maria Lopez" });
    await pf.getByLabel("Cleaning fee (USD)").fill("1");
    await pf.getByLabel("Management fee (%)").fill("15");
    const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/people");
    await pf.getByRole("button", { name: "Add property" }).click();
    await saved;
    await expect(page.getByTestId("properties-table").getByRole("row", { name: new RegExp(name) })).toContainText("$1.00");
  }
  await page.goto("/settings");
  await page.getByLabel("Vault account").fill("vault.casahosts.testnet");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("vault-saved")).toBeVisible();
  await approveAllPayees(page);
  await expect(page.getByTestId("payees-table")).not.toContainText("Needs signature");

  // before any payout: an empty statement, reachable without a session
  const early = await copyStatementLink(page, "Maria Lopez");
  expect(early).toMatch(/\/statement\/[A-Za-z0-9_-]{22}$/);
  const outsider = await (await browser.newContext()).newPage();
  await outsider.goto(early);
  await expect(outsider.getByTestId("statement-empty")).toBeVisible();

  await page.goto("/import");
  await page.getByTestId("import-file-input").setInputFiles(`${FIXTURES}airbnb-style-small.csv`);
  await expect(page.getByTestId("import-preview-summary")).toHaveText("4 will match, 0 flagged, 0 duplicates");
  await page.getByTestId("import-confirm").click();
  await page.getByTestId("import-done-bookings").click();
  await page.goto("/payouts");
  await page.getByTestId("agent-run-button").click();
  await expect(page.getByTestId("agent-run-result")).toContainText("Paid $11.83 to 4 payees in 1 transaction.");

  // the cleaner: two $1 fees paid, Ben's $1 held with the rest of his booking
  expect(await copyStatementLink(page, "Maria Lopez")).toBe(early); // same link as before
  await outsider.goto(early);
  await expect(outsider.getByTestId("statement-payee")).toHaveText("Maria Lopez");
  await expect(outsider.getByTestId("statement-business")).toHaveText("Casa Hosts");
  await expect(outsider.getByTestId("statement-paid-total")).toHaveText("$2.00");
  await expect(outsider.getByTestId("statement-held-total")).toHaveText("$1.00");
  const mariaHeld = outsider.locator('[data-testid^="statement-line-"][data-state="held"]');
  await expect(mariaHeld).toHaveCount(1);
  await expect(mariaHeld).toContainText("Loft 21");
  await expect(mariaHeld).toContainText("Held with the rest of this booking");
  await expect(outsider.locator('[data-state="paid"]')).toHaveCount(2);
  await expect(outsider.getByText("Simulated (rehearsal)").first()).toBeVisible();
  await expect(outsider.getByTestId("statement-lines")).not.toContainText("Ben Carter"); // no guest names
  const a11y = await new AxeBuilder({ page: outsider }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(a11y.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  if (process.env.SCREENSHOT_DIR) {
    await outsider.setViewportSize({ width: 390, height: 844 });
    await outsider.screenshot({ caret: "initial", fullPage: true, path: `${process.env.SCREENSHOT_DIR}/statement-cleaner.png` });
    await outsider.setViewportSize({ width: 1280, height: 720 });
  }

  // the owner: Ana's and Chloe's paid, Ben's $7.40 held for being over his $7 limit
  await outsider.goto(await copyStatementLink(page, "Owen Marsh"));
  await expect(outsider.getByTestId("statement-payee")).toHaveText("Owen Marsh");
  await expect(outsider.getByTestId("statement-paid-total")).toHaveText("$9.83");
  await expect(outsider.getByTestId("statement-held-total")).toHaveText("$7.40");
  await expect(outsider.locator('[data-state="held"]')).toContainText("Above your per-payout limit");

  // a made-up token gets the not-found page and nothing else (streamed, so checked like the pay page's)
  await outsider.goto("/statement/AAAAAAAAAAAAAAAAAAAAAA");
  await expect(outsider.getByTestId("not-found")).toBeVisible();
  await expect(outsider.getByTestId("statement-page")).toHaveCount(0);
});
