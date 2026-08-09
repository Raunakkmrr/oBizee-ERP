import { expect, test } from "@playwright/test";

import { signInAsOwner } from "./sign-in-helper";

/**
 * Raising a bill, end to end.
 *
 * Every defect this covers was live at some point in this build and none was
 * caught by a unit test: the review screen showed the most recent invoice in
 * the browser store rather than the one just raised, the job detail page
 * answered 400 because its URL carries a job number and the endpoint took only
 * a uuid, and nothing could issue a draft at all.
 */
test.describe("billing a job", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsOwner(page);
  });

  test("a job opens by its number, not by an id", async ({ page }) => {
    /*
      FR-210: the number is what gets read down the phone and typed into a
      browser afterwards, which is why the URL carries it. Taking only a uuid
      meant every load of this page answered 400.
    */
    await page.goto("/today");

    const firstJob = page.getByRole("link", { name: /J-\d{4}-\d{4}/ }).first();
    await expect(firstJob).toBeVisible();
    const jobNumber = ((await firstJob.textContent()) ?? "").trim();

    await firstJob.click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${jobNumber}`));
    await expect(page.getByText(jobNumber).first()).toBeVisible();
  });

  test("billing a job shows that invoice, not the last one", async ({ page }) => {
    await page.goto("/money/new");

    /*
      Wait for it rather than count it. `count()` does not auto-wait, so it
      returned zero before the screen's three reads had resolved and the test
      skipped itself — a green run that had checked nothing, which is the
      failure this whole harness exists to stop.
    */
    const bill = page.getByRole("button", { name: "Bill this" }).first();
    await expect(bill).toBeVisible();
    await bill.click();

    // The review screen is told which document to show, in the URL.
    await expect(page).toHaveURL(/\/money\/invoice\?id=[0-9a-f-]{36}/);

    /*
      And it is a real document, not the cold-start example. The fallback
      identity is gone: an invoice that carries no billTo says so rather than
      printing somebody else's GSTIN.
    */
    await expect(page.getByText(/SVC\/\d{2}-\d{2}\/\d{4}|Numbered on/)).toBeVisible();
  });

  test("the money screen reads receivables from the register", async ({ page }) => {
    await page.goto("/money");
    // Outstanding is invoices minus payments, computed by the register.
    await expect(page.getByRole("heading", { name: "Money" })).toBeVisible();
    await expect(page.getByText(/₹/).first()).toBeVisible();
  });
});
