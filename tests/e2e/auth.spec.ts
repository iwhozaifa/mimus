import { expect, test } from '@playwright/test';
import { signInViaMagicLink } from './helpers';

test('sign in with a magic link persists a session', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await signInViaMagicLink(page, email);
  await expect(page.getByText(email)).toBeVisible();

  await page.reload();
  await expect(page.getByText(email)).toBeVisible();
});
