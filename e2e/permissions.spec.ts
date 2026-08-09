import { expect, test } from "@playwright/test";

/**
 * What each role can reach, driven through the product.
 *
 * The authorization matrix proved the API refuses correctly. This proves the
 * *screens* agree with it — a role that is refused by the API but offered the
 * control anyway is a coordinator clicking something that always fails, and a
 * role offered a screen it cannot read is worse.
 */
async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill("obizee-dev-2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  /*
    Wait for the landing.

    Navigating before this resolves cancels the sign-in in flight, and the next
    page loads unauthenticated — three tests failed that way and looked like
    permission bugs.
  */
  await expect(page).toHaveURL(/\/today/);
}

async function signInByPhone(page: import("@playwright/test").Page, phone: string) {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Phone" }).fill(phone);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByRole("textbox", { name: "The code we sent" }).fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today/);
}

test.describe("what each role can reach", () => {
  test("only the owner is offered the team", async ({ page }) => {
    // people:manage is the owner's alone — a coordinator who could add a user
    // could add themselves an owner account.
    await signIn(page, "manish@shakticooling.test");
    await expect(page.getByRole("link", { name: "Team" })).toBeVisible();

    await page.getByRole("button", { name: /Signed in as/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await signIn(page, "priya@shakticooling.test");
    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
  });

  test("a coordinator opening the team screen is refused, not shown it", async ({ page }) => {
    /*
      Navigation being hidden is not access control. Typing the URL has to be
      refused too, and `Requires` fails closed rather than rendering while it
      finds out.
    */
    await signIn(page, "priya@shakticooling.test");
    await page.goto("/team");
    await expect(page.getByText(/cannot open this/i)).toBeVisible();
  });

  test("a technician gets the board, narrowed to their own work", async ({ page }) => {
    /*
      FR-306: `job:read_own`, not `job:read`. The board is a dispatch tool, so
      a technician gets their own work narrowed rather than a refusal — and
      must not see the whole firm's day.
    */
    await signInByPhone(page, "9820012345");

    const jobs = page.getByRole("link", { name: /J-\d{4}-\d{4}/ });
    await expect(jobs.first()).toBeVisible();

    // Ramesh has three of the seeded day's six jobs.
    const count = await jobs.count();
    expect(count, "a technician is seeing the whole board").toBeLessThan(6);
  });

  test("a technician is not offered the money screens", async ({ page }) => {
    await signInByPhone(page, "9820012345");
    await expect(page.getByRole("link", { name: "Money" })).toHaveCount(0);
  });
});
