import { expect, type Page } from "@playwright/test";

/**
 * Sign in as the seeded owner.
 *
 * Through the real form rather than by planting a token: the sign-in path is
 * itself one of the things most likely to break, and a helper that skips it
 * would let every other test keep passing while nobody could get in.
 */
export async function signInAsOwner(page: Page): Promise<void> {
  await page.goto("/sign-in");
  /*
    The two doors are a toggle, not a pair, and **Phone is the default** —
    technicians outnumber office staff, so the office picks its door. Any test
    reaching for an email field has to open it first.
  */
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByRole("textbox", { name: "Email" }).fill("manish@shakticooling.test");
  await page.getByRole("textbox", { name: "Password" }).fill("obizee-dev-2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today/);
}
