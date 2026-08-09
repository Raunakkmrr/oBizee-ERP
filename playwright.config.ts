import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end, against a real API and a real database.
 *
 * **Why this exists.** Every registry row read `✗ no harness`, and the defects
 * that got through were exactly the kind only a browser finds: an invoice
 * review screen showing a stale fixture, a job detail page answering 400 on
 * every load, a logo that led two roles to a permission refusal. Unit tests
 * passed throughout — each half was correct and the join was not.
 *
 * So nothing here is mocked. Playwright starts the API and the web app, signs
 * in through the real form, and drives the product a coordinator would use. A
 * suite that stubs the API tests the stub.
 */
const API = "http://localhost:8787";
const WEB = "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  /*
    macOS writes a `._name` sidecar for every file on this exFAT volume, and
    Playwright collects it as a spec — the same way vitest, drizzle-kit, the
    migration runner and the Next build each had to be taught not to. The
    seventh tool to trip over it.
  */
  testIgnore: "**/._*",
  /*
    Serial, deliberately.

    These share one database and one tenant, and several assert on counts and
    on the day's board. Parallel workers issuing invoices against one series
    would make every count flaky for a reason that has nothing to do with the
    product.
  */
  workers: 1,
  fullyParallel: false,
  // A failing E2E is a real signal; retrying it once hides a real flake.
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "line" : [["list"]],

  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL: WEB,
    /*
      `NEXT_PUBLIC_DATA_SOURCE=api` is what the app reads to choose the
      register over its fixtures. Without it the browser would render the
      seeded store and every assertion here would pass against data the API
      never sent — the exact "passing on nothing" the contract tests exist to
      stop.
    */
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: [
    {
      command:
        "node --experimental-strip-types --env-file=.env src/server.ts",
      cwd: "../obez-erp-api",
      url: `${API}/health`,
      // Reuse a server already running in development; start one in CI.
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npm run dev -- --port 3100",
      url: WEB,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_DATA_SOURCE: "api",
        NEXT_PUBLIC_API_URL: API,
      },
    },
  ],
});
