import { expect, test } from "@playwright/test";

import { signInAsOwner } from "./sign-in-helper";

/**
 * Every screen actually reads the API.
 *
 * `/contracts` sat rendering "This screen is not wired to the backend yet" over
 * two live AMCs for weeks. Nothing failed: the seam test covered the nine
 * composed reads that existed, the screen's own unit tests passed against the
 * fixture, and the only way to find out was to open it.
 *
 * So this walks the screens and fails on that message wherever it appears. It
 * is deliberately not a list of expectations per screen — a new page with no
 * API behind it is caught the day it is added, without anybody remembering to
 * extend a test.
 */
const SCREENS = [
  "/today",
  "/jobs",
  "/leads",
  "/contracts",
  "/customers",
  "/money",
  "/vendors",
  "/parts",
  "/team",
  "/reports",
  "/reports/gst",
  "/home",
];

test.describe("nothing is still on fixtures", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsOwner(page);
  });

  for (const path of SCREENS) {
    test(`${path} reads the register`, async ({ page }) => {
      await page.goto(path);

      /*
        Wait for the heading rather than a fixed pause: these screens each make
        two or three reads, and asserting before they land would pass on a
        skeleton — the "green run that checked nothing" this harness exists to
        stop.
      */
      await expect(page.getByRole("heading").first()).toBeVisible();
      const body = page.locator("body");
      await expect(body).not.toContainText("not wired to the backend yet");
      await expect(body).not.toContainText("NO_API_IMPL");
    });
  }
});

/**
 * The contracts screen, now that it has data behind it.
 *
 * Asserting on the composition rather than merely on "something rendered": the
 * endpoint returned database rows before this, and a screen fed uuids where it
 * expects a customer's name looks populated while being useless.
 */
test.describe("contracts", () => {
  test("shows the customer's name and the schedule, not ids", async ({ page }) => {
    await signInAsOwner(page);
    await page.goto("/contracts");

    // The seeded AMC references are AMC-<fy>-<serial>.
    await expect(page.getByText(/AMC-\d{4}-\d{4}/).first()).toBeVisible();
    /*
      A uuid anywhere in the body means a join was dropped on the way through.
      Cheap to assert and it is precisely what the raw-rows version would have
      shown.
    */
    await expect(page.locator("body")).not.toContainText(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
  });
});

/**
 * FR-102's duplicate check, fired the way a coordinator fires it.
 *
 * §6.7.1 puts the phone field first specifically so this can happen while the
 * customer is still talking. It was built against a fixture with two
 * hard-coded numbers and never called the API at all, so the behaviour was
 * real and the thing it was supposed to detect was not.
 */
test.describe("duplicate detection", () => {
  test("a number already on file is recognised while it is being typed", async ({ page }) => {
    await signInAsOwner(page);

    /*
      Take a number the register genuinely holds, off the queue's own dial
      link. Inventing one is how the fixture version of this passed while
      detecting nothing, and hard-coding one breaks the day the seed changes.
    */
    await page.goto("/leads");
    const dial = page.locator('a[href^="tel:"]').first();
    await expect(dial).toBeVisible();
    const known = ((await dial.getAttribute("href")) ?? "").replace(/\D/g, "");
    expect(known.length, "no lead on the queue has a dialable number").toBeGreaterThan(9);

    await page.goto("/leads/new");
    // The last ten digits are what somebody types; the 91 is ours to add.
    await page.getByRole("textbox", { name: "Phone" }).fill(known!.slice(-10));

    /*
      The panel names the existing record. Asserted on the reference rather than
      on the word "duplicate", because §6.7.2 is explicit that the resting state
      shows *nothing* — so the presence of a lead reference is the signal.
    */
    await expect(page.getByText(/L-\d{4}-\d{4}|Open existing lead|already/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("an unknown number shows nothing at all", async ({ page }) => {
    await signInAsOwner(page);
    await page.goto("/leads/new");
    await page.getByRole("textbox", { name: "Phone" }).fill("9999900000");
    await page.waitForTimeout(1500);

    /*
      §6.7.2: the empty state is silence, not "No customer found" — which reads
      as an error and teaches a coordinator to distrust the panel.
    */
    await expect(page.locator("body")).not.toContainText(/no customer found/i);
    await expect(page.getByText(/L-\d{4}-\d{4}/)).toHaveCount(0);
  });
});
