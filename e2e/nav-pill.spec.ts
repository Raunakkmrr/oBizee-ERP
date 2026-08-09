import { expect, test } from "@playwright/test";

import { signInAsOwner } from "./sign-in-helper";

/**
 * The travelling highlight, now that it is not a library.
 *
 * It used to be a `motion.span` with a shared `layoutId`, which put framer-motion
 * on the critical path of every screen. The replacement is one absolutely
 * positioned element that the rail moves by measuring the active row — same
 * motion, 41 KB lighter, and entirely dependent on a measurement being right.
 * A `layoutId` either works or does not; this can silently land nine pixels off,
 * or on the wrong row, or nowhere.
 *
 * So it is asserted against the row it is meant to be on. The interesting case
 * is Today → Jobs, because those sit in different `SidebarGroup`s and crossing
 * that boundary is what the shared `layoutId` existed for.
 */
test.describe("the navigation highlight", () => {
  /**
   * The row the rail measures — the `li`, not the link inside it.
   *
   * Asserting against the `<a>` reads about nine pixels out, because the link
   * is inset within its row. That is the measurement the rail is not making.
   */
  const rowFor = (page: import("@playwright/test").Page, label: string) =>
    page.locator("li").filter({ has: page.getByRole("link", { name: label, exact: true }) }).first();

  const pill = (page: import("@playwright/test").Page) =>
    page.locator('span[aria-hidden="true"].bg-sidebar-accent').first();

  /**
   * Where the pill has come to rest.
   *
   * Polled rather than read after a fixed wait. The rows deal in over ~700ms
   * and the pill travels for 260, so a single measurement taken too early
   * catches it mid-flight — which is exactly what happened while writing this,
   * and it looked like the component was broken.
   */
  async function settledOffset(
    page: import("@playwright/test").Page,
    label: string,
  ): Promise<number> {
    let offset = Number.NaN;
    await expect
      .poll(
        async () => {
          const a = await pill(page).boundingBox();
          const b = await rowFor(page, label).boundingBox();
          if (!a || !b || a.height === 0) return Number.NaN;
          offset = Math.abs(a.y - b.y);
          return offset;
        },
        { message: `the highlight never settled on ${label}`, timeout: 8_000 },
      )
      .toBeLessThan(2);
    return offset;
  }

  test("sits on the active row, and travels across a group boundary", async ({ page }) => {
    await signInAsOwner(page);
    await page.goto("/today");

    await settledOffset(page, "Today");
    const beforeY = (await pill(page).boundingBox())!.y;

    // Jobs lives in the Work group; Today lives in Overview.
    await page.getByRole("link", { name: "Jobs", exact: true }).click();
    await expect(page).toHaveURL(/\/jobs/);

    await settledOffset(page, "Jobs");
    const afterY = (await pill(page).boundingBox())!.y;

    // One element that moved, not two that swapped.
    expect(Math.abs(afterY - beforeY), "the highlight did not move").toBeGreaterThan(20);
    await expect(pill(page)).toHaveCount(1);
  });

  test("is hidden in the footer list, which holds no active row", async ({ page }) => {
    await signInAsOwner(page);
    await page.goto("/today");

    /*
      Two rails, and only one of them has an active row. The second must be
      invisible rather than parked at the top of its list — a highlight resting
      on Settings when the reader is on Today points at the wrong place.
    */
    const pills = page.locator('span[aria-hidden="true"].bg-sidebar-accent');
    await expect(pills).toHaveCount(2);
    await expect(pills.nth(1)).toHaveCSS("opacity", "0");
  });
});
