import { test, expect } from "@playwright/test";

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/ERP|Login/i);
});

test("redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/");
  // Should redirect to login or show login page
  await expect(page.locator("text=/Sign In|Log In|Login/i").first()).toBeVisible({ timeout: 10_000 });
});
