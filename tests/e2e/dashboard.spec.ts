import { expect, test } from '@playwright/test';
import { signInViaMagicLink } from './helpers';

test('a signed-in user lands on Sky with workspace, identity, and nav', async ({ page }) => {
  const email = `e2e-dashboard-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);

  await expect(page).toHaveURL(/\/sky$/);
  await expect(page.getByRole('heading', { name: /good morning/i })).toBeVisible();

  await expect(page.getByRole('link', { name: 'Sky' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Canopy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ground' })).toBeVisible();

  await page.getByRole('button', { name: /account menu/i }).click();
  await expect(page.getByRole('link', { name: 'Connections' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Members' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Billing' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Feature switches' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit log' })).toBeVisible();
});
