// tests/e2e/auth/auth-flow.spec.ts
//
// Universal user-management auth flow spec. Exercises UM-1, UM-2,
// UM-3, UM-5 against a running dev server. Driven by verify-login-flow.mjs.
//
// Required env (loaded from .env.test):
//   TEST_USER_A_EMAIL=...
//   TEST_USER_A_PASSWORD=...
//
// The base URL comes from PLAYWRIGHT_BASE_URL (set by verify-login-flow.mjs).
// If running directly via `npx playwright test`, set PLAYWRIGHT_BASE_URL
// manually first.

import { expect, test } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test" });
loadEnv({ path: ".env.local" });

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.TEST_USER_A_EMAIL!;
const PASSWORD = process.env.TEST_USER_A_PASSWORD!;

test.describe("UM-1..UM-5 — universal auth flow", () => {
  test.skip(
    !EMAIL || !PASSWORD,
    "TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD must be set in .env.test"
  );

  test("US-001: sign in with valid credentials redirects to dashboard", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('[name=email]', EMAIL);
    await page.fill('[name=password]', PASSWORD);
    await Promise.all([
      page.waitForURL(/\/(dashboard|home|app)/, { timeout: 10_000 }),
      page.click('button[type=submit]'),
    ]);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("US-001b: sign in with invalid credentials shows inline error (not 500)", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('[name=email]', EMAIL);
    await page.fill('[name=password]', "wrong-password-on-purpose");
    await page.click('button[type=submit]');
    // Inline error visible, NOT a 500 page.
    const error = page.locator('[role="alert"], .error, [data-error]').first();
    await expect(error).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("US-002: sign out clears sb-* cookies and protected route redirects to login", async ({
    page,
    context,
  }) => {
    // Sign in first
    await page.goto(`${BASE_URL}/login`);
    await page.fill('[name=email]', EMAIL);
    await page.fill('[name=password]', PASSWORD);
    await Promise.all([
      page.waitForURL(/\/(dashboard|home|app)/, { timeout: 10_000 }),
      page.click('button[type=submit]'),
    ]);

    // POST to /auth/signout
    const signoutResponse = await page.request.post(`${BASE_URL}/auth/signout`);
    expect([200, 303, 302].includes(signoutResponse.status())).toBeTruthy();

    // Cookies should not contain any sb-* entries.
    const cookies = await context.cookies();
    const sbCookies = cookies.filter((c) => c.name.startsWith("sb-"));
    expect(sbCookies, `sb-* cookies still present: ${sbCookies.map((c) => c.name).join(", ")}`).toHaveLength(0);

    // Protected route must redirect to /login.
    const res = await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    // Either redirected (URL ends up at /login) or response is a redirect.
    expect(page.url()).toMatch(/\/login/);
  });

  test("US-003: forgot-password shows generic confirmation regardless of email existence", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/forgot-password`);
    // Send for the real test user.
    await page.fill('[name=email]', EMAIL);
    await page.click('button[type=submit]');
    const realConfirmation = await page
      .locator("text=/check your email|reset link|sent/i")
      .first()
      .textContent({ timeout: 5_000 });

    // Send for a fake email — must show the SAME message (no enumeration).
    await page.goto(`${BASE_URL}/forgot-password`);
    await page.fill('[name=email]', "definitely-not-a-real-user@example.test");
    await page.click('button[type=submit]');
    const fakeConfirmation = await page
      .locator("text=/check your email|reset link|sent/i")
      .first()
      .textContent({ timeout: 5_000 });

    expect(fakeConfirmation).toEqual(realConfirmation);
  });
});
