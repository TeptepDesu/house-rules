import { defineConfig, devices } from "@playwright/test";

// E2E against the real app on a fresh local database (PGlite) and testnet config.
// 1Click is mocked at the route level in specs that need it; no real money, no network calls.
const PORT = 3200;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  expect: { timeout: 10_000 }, // next dev compiles routes on first visit
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `rm -rf .data/e2e && next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PGLITE_DIR: ".data/e2e", NEAR_NETWORK: "testnet", DATABASE_URL: "", SESSION_SECRET: "" },
  },
});
