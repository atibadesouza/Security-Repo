// =============================================================================
// auth-flow.spec.ts — golden-path auth E2E (Playwright)
// =============================================================================
// Exercises the real browser auth flow against the running app: an
// unauthenticated user is redirected to /login, can sign in with the seeded
// test user, lands on a protected page, and signs out. Reads credentials from
// .env.test (TEST_USER_A_*). ADAPT selectors/routes to your app.
//
// Run: npx playwright test tests/e2e/auth/auth-flow.spec.ts
// =============================================================================

import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_A_EMAIL ?? "";
const PASSWORD = process.env.TEST_USER_A_PASSWORD ?? "";

test.describe("auth flow", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_A_* not set in .env.test");

  test("unauthenticated user is redirected to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("seeded user can sign in and reach a protected page", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', EMAIL);
    await page.fill('[name="password"]', PASSWORD);
    await page.click('[type="submit"]');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).not.toContainText(/invalid login|incorrect password/i);
  });

  test("wrong password is rejected", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', EMAIL);
    await page.fill('[name="password"]', PASSWORD + "_WRONG");
    await page.click('[type="submit"]');
    await expect(page).toHaveURL(/\/login/);
  });
});
