/**
 * §9.1's first-screen JS budget, measured rather than assumed.
 *
 * "≤ 350 KB gzipped" against a 4 Mbps link on a mid-range laptop. It had never
 * been run — and the first run came in at 393 KB, so the number was not
 * realistic on the current dependency set.
 *
 * Measured off the wire, not off the build report: `response.body()` returns
 * the decoded body, so it is gzipped here to get what actually crosses the
 * network. Counted across sign-in → board, because that is everything a
 * coordinator downloads before she can do anything.
 *
 * Needs a production server: `next build && next start --port 3200`, with the
 * API allowing that origin. Development bundles are unminified and measure
 * nothing useful.
 */
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const BUDGET_KB = 350;
const ORIGIN = process.env.MEASURE_ORIGIN ?? "http://localhost:3200";

const browser = await chromium.launch();
const page = await browser.newPage();
const scripts = new Map();

page.on("response", async (response) => {
  if (response.request().resourceType() !== "script") return;
  try {
    scripts.set(response.url(), gzipSync(await response.body()).length);
  } catch {
    // A response whose body is gone by the time we ask is one we cannot count.
  }
});

await page.goto(`${ORIGIN}/sign-in`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Email", exact: true }).click();
await page.getByRole("textbox", { name: "Email" }).fill("manish@shakticooling.test");
await page.getByRole("textbox", { name: "Password" }).fill("obizee-dev-2026");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(/\/today/);
await page.waitForLoadState("networkidle");

const total = [...scripts.values()].reduce((sum, n) => sum + n, 0);
const kb = Math.round(total / 1024);

console.log(`first-screen JS: ${kb} KB gzipped across ${scripts.size} files (budget ${BUDGET_KB})`);
for (const [url, size] of [...scripts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
  console.log(`   ${String(Math.round(size / 1024)).padStart(4)} KB  ${url.split("/").pop()}`);
}

await browser.close();
process.exit(kb <= BUDGET_KB ? 0 : 1);
