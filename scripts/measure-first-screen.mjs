/**
 * §9.1's first-screen JS budget, measured rather than assumed.
 *
 * "≤ 350 KB gzipped" against a 4 Mbps link on a mid-range laptop. It had never
 * been run — and the first run came in at 393 KB, so the number was not
 * realistic on the current dependency set.
 *
 * Measured off the wire, not off the build report: `response.body()` returns
 * the decoded body, so it is gzipped here to get what actually crosses the
 * network.
 *
 * **Two numbers, because they answer different questions.** The budget is on
 * *the first screen*, and the board is a different screen from the sign-in
 * form — counting them together charged the board for chunks only the sign-in
 * page loads. That is what it did, which is part of why the first run read 393
 * KB. The cold journey is reported alongside, unbudgeted, because it is what a
 * coordinator actually waits through on a Monday morning and somebody should
 * be looking at it.
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

const journeyKb = Math.round([...scripts.values()].reduce((sum, n) => sum + n, 0) / 1024);

/*
  Now the board on its own, from a cold cache but a warm session. The refresh
  cookie survives a new context, so this is the page a coordinator opens every
  morning after the first — and it is the screen the budget is written about.
*/
const cookies = await page.context().cookies();
const second = await browser.newContext();
await second.addCookies(cookies);
const board = await second.newPage();

scripts.clear();
board.on("response", async (response) => {
  if (response.request().resourceType() !== "script") return;
  try {
    scripts.set(response.url(), gzipSync(await response.body()).length);
  } catch {
    // A response whose body is gone by the time we ask is one we cannot count.
  }
});

await board.goto(`${ORIGIN}/today`, { waitUntil: "networkidle" });
const kb = Math.round([...scripts.values()].reduce((sum, n) => sum + n, 0) / 1024);

console.log(`first screen (/today): ${kb} KB gzipped across ${scripts.size} files (budget ${BUDGET_KB})`);
for (const [url, size] of [...scripts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
  console.log(`   ${String(Math.round(size / 1024)).padStart(4)} KB  ${url.split("/").pop()}`);
}
console.log(`cold journey (sign-in → board): ${journeyKb} KB — not budgeted, but what a first visit costs`);

await browser.close();
process.exit(kb <= BUDGET_KB ? 0 : 1);
