import { expect, test } from '@playwright/test';
import { signInViaMagicLink } from './helpers';

test('a signed-in user lands on the dashboard with workspace, identity, and nav', async ({
  page,
}) => {
  const email = `e2e-dashboard-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText('owner', { exact: false })).toBeVisible();

  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Connections' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Members' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Billing' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Feature switches' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit log' })).toBeVisible();
});
