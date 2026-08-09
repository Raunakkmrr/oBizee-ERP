import { expect, test } from "@playwright/test";

import { signInAsOwner } from "./sign-in-helper";

/**
 * The two doors, and what is behind them.
 *
 * §9.4 gives field staff a phone and a code, and the office an email and a
 * password, because this market's users do not reliably have or remember work
 * email. Both have to work, and until this suite existed neither was exercised
 * by anything but hand-probing.
 */
test.describe("signing in", () => {
  test("the office signs in with email and password and lands on the board", async ({ page }) => {
    await page.goto("/sign-in");

    // Phone is the default door; the office opens the other one.
    await page.getByRole("button", { name: "Email", exact: true }).click();
    await page.getByRole("textbox", { name: "Email" }).fill("manish@shakticooling.test");
    await page.getByRole("textbox", { name: "Password" }).fill("obizee-dev-2026");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/today/);
    /*
      The identity came from the token, and it says so in words.

      Asserting the button's accessible name rather than the text anywhere on
      screen: the name appears in the sidebar too, and this is the one that
      proves the shell resolved a *signed-in* user rather than rendering a
      name it had lying around.
    */
    await expect(
      page.getByRole("button", { name: /Signed in as Manish Agarwal, Owner/ }),
    ).toBeVisible();
  });

  test("field staff sign in with a phone and a code", async ({ page }) => {
    await page.goto("/sign-in");

    // Already the default — a technician types their number and nothing else.
    await page.getByRole("textbox", { name: "Phone" }).fill("9820012345");
    await page.getByRole("button", { name: "Send me a code" }).click();

    // The dev sender's fixed code, which cannot reach production.
    await page.getByRole("textbox", { name: "The code we sent" }).fill("123456");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/today/);
  });

  test("a wrong password is refused, and says so", async ({ page }) => {
    await page.goto("/sign-in");

    await page.getByRole("button", { name: "Email", exact: true }).click();
    await page.getByRole("textbox", { name: "Email" }).fill("manish@shakticooling.test");
    await page.getByRole("textbox", { name: "Password" }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("an unsigned visitor is sent to sign in rather than shown a page", async ({ page }) => {
    /*
      The shell decides this, because it wraps every screen. A page rendered
      without a user has already leaked whatever it was about to check.
    */
    await page.goto("/today");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("signing out ends the session at the register", async ({ page }) => {
    await signInAsOwner(page);

    await page.getByRole("button", { name: /Signed in as/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in/);

    // And it stays ended: navigating back must not resurrect it.
    await page.goto("/today");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
