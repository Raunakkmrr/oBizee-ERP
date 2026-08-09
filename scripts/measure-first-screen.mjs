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
 * **Two numbers.** The budgeted one is sign-in through to a rendered board:
 * everything a coordinator waits for before she can do anything, which is what
 * §9.1 is protecting. As it turns out the sign-in form loads nothing of its
 * own, so this is also the board's own weight.
 *
 * The second is unbudgeted and was a surprise. Next prefetches every `<Link>`
 * in the viewport, and the sidebar holds twelve of them — so a board left open
 * quietly pulls every screen in the product. It happens at idle and blocks
 * nothing, which is why it is not the budget; it is still about a megabyte on
 * a connection that may be a phone hotspot, and nobody had looked at it.
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
const heaviest = [...scripts.entries()].sort((a, b) => b[1] - a[1]);

/*
  What the same page goes on to pull once it is idle: the prefetch of every
  navigation target. Measured from a fresh context with the session's cookie,
  so it is a genuine cold open rather than a warmed cache.
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
const idleKb = Math.round([...scripts.values()].reduce((sum, n) => sum + n, 0) / 1024);

console.log(
  `first screen (sign-in → board): ${journeyKb} KB gzipped ` +
    `(budget ${BUDGET_KB}) — ${journeyKb <= BUDGET_KB ? "pass" : "OVER"}`,
);
for (const [url, size] of [...heaviest].slice(0, 5)) {
  console.log(`   ${String(Math.round(size / 1024)).padStart(4)} KB  ${url.split("/").pop()}`);
}
console.log(
  `\nafter idle, with the sidebar's links prefetched: ${idleKb} KB across ${scripts.size} files.` +
    `\nNot budgeted — it blocks nothing — but it is what a board left open costs a hotspot.`,
);

await browser.close();
process.exit(journeyKb <= BUDGET_KB ? 0 : 1);
