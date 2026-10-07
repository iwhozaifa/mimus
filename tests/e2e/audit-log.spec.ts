import { expect, test } from '@playwright/test';
import { signInViaMagicLink } from './helpers';

test('a signed-in user sees the audit log placeholder', async ({ page }) => {
  const email = `e2e-audit-log-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);
  await page.goto('/audit-log');

  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
  await expect(page.getByText(/coming soon/i)).toBeVisible();
});
