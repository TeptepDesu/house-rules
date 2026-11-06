import { expect, test } from "@playwright/test";
import { FIXTURES, addPayee, signUp } from "./helpers";

// The Overview's weekly chart, and how a run that sent nothing reads there.

test("collected-by-week chart: none before data; then bars, keyboard tooltip and a table; a fully held run says Held back", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Casa Hosts");
  await expect(page.getByTestId("overview-metrics")).toBeVisible();
  await expect(page.getByTestId("overview-collected-chart")).toHaveCount(0);

  await page.goto("/people");
  await addPayee(page, { name: "Owen Reyes", role: "Property owner", account: "houserules-owner-1.testnet", cap: "800" });
  await addPayee(page, { name: "Maria Santos", role: "Cleaner", account: "houserules-cleaner-1.testnet", cap: "100" });
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
    await expect(page.getByTestId("properties-table").getByRole("row", { name: new RegExp(name) })).toBeVisible();
  }
  await page.goto("/import");
  await page.getByTestId("import-file-input").setInputFiles(`${FIXTURES}airbnb-style.csv`);
  await page.getByTestId("import-confirm").click();
  await expect(page.getByTestId("import-done-summary")).toContainText("22 bookings added");

  // Your homes: a picture-first card per home, with what it has earned
  await page.goto("/");
  await expect(page.getByTestId("overview-homes").locator('[data-testid^="home-card-"]')).toHaveCount(3);
  const casa = page.getByTestId("overview-homes").locator('[data-testid^="home-card-"]').filter({ hasText: "Casa Azul" });
  await expect(casa).toContainText("Owen Reyes · Maria Santos");
  await expect(casa).toContainText(/\$[\d,]+\.\d\d/);
  await expect(casa.locator("[data-scene]")).toHaveAttribute("data-scene", "villa");

  await page.goto("/");
  const chart = page.getByTestId("overview-collected-chart");
  await expect(chart.getByRole("heading", { name: "Collected by week" })).toBeVisible();
  const weeks = chart.locator('[data-testid^="overview-collected-week-"]');
  const n = await weeks.count();
  expect(n).toBeGreaterThan(1);
  await expect(page.getByTestId("overview-collected-peak")).toContainText("$");

  // every week is reachable by keyboard and named for screen readers
  await weeks.first().focus();
  await expect(weeks.first()).toHaveAttribute("aria-label", /^Week of .+: \$[\d,.]+ from \d+ bookings?$/);

  await page.getByTestId("overview-collected-table-toggle").locator("summary").click();
  await expect(page.getByTestId("overview-collected-table").locator("tbody tr")).toHaveCount(n);

  await page.goto("/settings");
  await page.getByLabel("Vault account").fill("vault.houserules-operator.testnet");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("vault-saved")).toBeVisible();

  // both payees still need approving, so the pre-check holds everything and nothing is sent
  await page.goto("/payouts");
  await page.getByTestId("agent-run-button").click();
  await expect(page.getByTestId("agent-run-result")).toHaveAttribute("data-status", "held");
  await page.goto("/");
  await expect(page.getByTestId("overview-runs")).toContainText("Held back");
  await expect(page.getByTestId("overview-runs")).not.toContainText("Failed");
});

test("phones get a bottom tab bar, and the sign-in page keeps its form on screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.getByTestId("auth-showcase")).toContainText("Your homes.");
  await expect(page.getByTestId("login-submit")).toBeInViewport();
  await signUp(page, "Casa Hosts");
  await expect(page.getByTestId("app-header")).toBeHidden();
  await expect(page.getByTestId("app-tabbar")).toBeVisible();
  await page.getByTestId("tab-bookings").click();
  await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
  await expect(page.getByTestId("tab-bookings")).toHaveAttribute("aria-current", "page");
  await page.getByTestId("app-menu-toggle").click();
  await expect(page.getByTestId("session-mobile-user-name")).toHaveText("Casa Hosts"); // phones can sign out now
  await expect(page.getByTestId("session-mobile-logout")).toBeVisible();
  await page.getByTestId("nav-mobile-invoices").click();
  await expect(page.getByRole("heading", { name: "Invoices", exact: true })).toBeVisible();
  await expect(page.getByTestId("nav-mobile-invoices")).toBeHidden(); // the menu closes itself instead of covering the page
});

test("on a tablet every tab stays on screen, and the sign-in fields show where you are", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Email").focus();
  const shadow = await page.getByLabel("Email").locator("..").evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).not.toBe("none");
  await signUp(page, "Casa Hosts");
  await expect(page.getByTestId("app-header")).toBeVisible();
  for (const t of ["nav-overview", "nav-settings"]) await expect(page.getByTestId(t)).toBeInViewport({ ratio: 1 });
});
