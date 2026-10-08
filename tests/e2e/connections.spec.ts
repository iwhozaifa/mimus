import { expect, test } from '@playwright/test';
import { seedConnectedAccount, signInViaMagicLink } from './helpers';

test('changing a connected account visibility and disconnecting persists through RLS', async ({
  page,
}) => {
  const email = `e2e-connections-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);
  await seedConnectedAccount(email);

  await page.goto('/settings/connections');

  const row = page.getByRole('listitem').filter({ hasText: 'google' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('combobox')).toHaveValue('private');

  await row.getByRole('combobox').selectOption('team');
  await expect(row.getByRole('combobox')).toHaveValue('team');

  // Reload to prove the change was persisted through the real RLS-respecting
  // write path (this page uses the signed-in user's own session, not a
  // service-role bypass), not just held in client-side state. The select's
  // onChange fires the update as an unawaited Server Action call, so retry
  // the reload+check instead of assuming it has already landed.
  let rowAfterReload = page.getByRole('listitem').filter({ hasText: 'google' });
  await expect(async () => {
    await page.reload();
    rowAfterReload = page.getByRole('listitem').filter({ hasText: 'google' });
    await expect(rowAfterReload.getByRole('combobox')).toHaveValue('team');
  }).toPass({ timeout: 10_000 });

  await rowAfterReload.getByRole('button', { name: /disconnect/i }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'google' })).toHaveCount(0);
});

test('the Connect Google link points at the OAuth start route', async ({ page }) => {
  const email = `e2e-connections-link-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);

  await page.goto('/settings/connections');
  await expect(page.getByRole('link', { name: /connect google/i })).toHaveAttribute(
    'href',
    '/api/connectors/google/start',
  );
});
