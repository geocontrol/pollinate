import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/** Runs against a production build (`npm run test:e2e` builds first) and the dev database. */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://pollinate_app:pollinate_app@localhost:5432/pollinate",
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
