import { expect, test } from "@playwright/test";

import { signInAsOwner } from "./sign-in-helper";

/**
 * The refresh token is a cookie the page cannot read.
 *
 * Every other test in this suite would pass with the token back in
 * `localStorage`: the access token lasts fifteen minutes and nothing here runs
 * that long, so the refresh path is never exercised. This file is the one that
 * would fail — it reloads, which throws away the in-memory access token and
 * leaves the session with nothing to stand on but the cookie.
 */
test.describe("where the session lives", () => {
  test("nothing in local storage is a credential", async ({ page }) => {
    await signInAsOwner(page);

    const stored = await page.evaluate(() =>
      Object.fromEntries(
        Object.keys(window.localStorage).map((key) => [key, window.localStorage.getItem(key)]),
      ),
    );

    /*
      A boolean, and only a boolean. Asserted as an exact match rather than
      "does not contain a token", because the failure this guards against is
      somebody adding a second thing later — and a substring check would not
      notice.
    */
    expect(stored["obizee.session"]).toBe("1");
    for (const [key, value] of Object.entries(stored)) {
      expect(value, `${key} looks like a token`).not.toMatch(/^ey[A-Za-z0-9_-]{10,}\./);
    }
  });

  test("the refresh cookie is httpOnly and scoped to /auth", async ({ page, context }) => {
    await signInAsOwner(page);

    const cookie = (await context.cookies()).find((c) => c.name === "obizee_refresh");
    expect(cookie, "no refresh cookie was set").toBeDefined();
    // httpOnly is the whole point: an injected script cannot read this.
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    /*
      Scoped, so it is not sent on the hundreds of ordinary API calls that have
      no use for it. Only exchanging and revoking need it, and both are /auth.
    */
    expect(cookie?.path).toBe("/auth");
  });

  test("a reload resumes the session from the cookie alone", async ({ page }) => {
    await signInAsOwner(page);

    /*
      The access token is held in a module variable and nowhere else, so this
      destroys it. What is left is the cookie. If the browser is not sending it,
      or the API is not accepting it, this lands on the sign-in screen.
    */
    await page.reload();
    await expect(page).toHaveURL(/\/today/);
    /*
      The identity, not merely the shell. A blank gated route still renders a
      sidebar, and that is exactly the bug this suite caught last round — so the
      assertion has to be on something only a resolved caller can produce.
    */
    await expect(page.getByRole("button", { name: /Signed in as/ })).toBeVisible();
  });

  test("signing out clears the cookie, and the reload no longer works", async ({
    page,
    context,
  }) => {
    await signInAsOwner(page);
    await page.getByRole("button", { name: /Signed in as/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in/);

    expect((await context.cookies()).find((c) => c.name === "obizee_refresh")).toBeUndefined();

    // And the door is shut at the register too, not only in this tab.
    await page.goto("/today");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
