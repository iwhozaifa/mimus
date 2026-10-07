import { expect, test } from '@playwright/test';
import { signInViaMagicLink } from './helpers';

test('connecting a stub account and changing its visibility persists through RLS', async ({
  page,
}) => {
  const email = `e2e-connections-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);

  await page.goto('/settings/connections');
  await page.getByRole('button', { name: /connect test account/i }).click();

  const row = page.getByRole('listitem').filter({ hasText: 'google' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('combobox')).toHaveValue('private');

  await row.getByRole('combobox').selectOption('team');
  await expect(row.getByRole('combobox')).toHaveValue('team');

  // Reload to prove the change was persisted through the real RLS-respecting
  // write path (this page uses the signed-in user's own session, not a
  // service-role bypass), not just held in client-side state.
  await page.reload();
  const rowAfterReload = page.getByRole('listitem').filter({ hasText: 'google' });
  await expect(rowAfterReload.getByRole('combobox')).toHaveValue('team');

  await rowAfterReload.getByRole('button', { name: /disconnect/i }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'google' })).toHaveCount(0);
});
