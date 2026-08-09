import { expect, test } from "@playwright/test";

import { signInAsOwner } from "./sign-in-helper";

/**
 * §9.1's budgets, as a gate rather than a paragraph.
 *
 * They were written down and never once run. A budget nobody measures is a
 * wish, and the first measurement is the one that tells you whether the number
 * was ever realistic — so this fails the build rather than printing a warning.
 *
 * Measured from what the browser actually transfers, not from build output:
 * the question is what arrives over a 4 Mbps link, and only the network answers
 * that.
 */
test.describe("performance budgets", () => {
  test("the coordinator's first screen stays under its JS budget", async ({ page }) => {
    /*
      §9.1: "≤ 350 KB gzipped; the whole app code-split by nav item". Counted
      over the whole sign-in → board journey, because that is what a
      coordinator downloads before she can do anything — measuring `/today`
      alone would quietly exclude the door she came through.
    */
    /*
      The body's real length, not `content-length`.

      The dev server sends chunked responses with no such header, so summing it
      reported 3 KB for the whole application — a gate that measured nothing
      and passed, which is worse than no gate.
    */
    const bodies: Promise<number>[] = [];
    page.on("response", (response) => {
      if (response.request().resourceType() !== "script") return;
      bodies.push(
        response
          .body()
          .then((buffer) => buffer.length)
          .catch(() => 0),
      );
    });

    await signInAsOwner(page);
    await page.waitForLoadState("networkidle");

    const scriptBytes = (await Promise.all(bodies)).reduce((sum, n) => sum + n, 0);

    const kb = Math.round(scriptBytes / 1024);
    console.log(`first-screen JS transferred: ${kb} KB`);

    /*
      Development builds ship unminified modules and the dev overlay, so this
      is a smoke alarm rather than the real figure — it catches a route that
      starts pulling the whole app in. The production number belongs in CI
      against `next build && next start`, and is recorded as still owed.
    */
    expect(kb, "first-screen JS has grown sharply").toBeLessThan(12_000);
  });

  test("the board answers within its budget on a warm cache", async ({ page }) => {
    await signInAsOwner(page);

    const started = Date.now();
    await page.goto("/today");
    await expect(page.getByRole("link", { name: /J-\d{4}-\d{4}/ }).first()).toBeVisible();
    const elapsed = Date.now() - started;

    console.log(`board warm render: ${elapsed} ms`);
    // §9.1's warm budget is 800 ms; dev-mode compilation makes that unmeasurable
    // here, so this guards the order of magnitude and no more.
    expect(elapsed, "the board took long enough to feel broken").toBeLessThan(8_000);
  });
});
