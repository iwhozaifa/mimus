import { createServiceClient } from '@/src/db/service';
import { expect, test } from '@playwright/test';
import { seedConnectedAccount, signInViaMagicLink } from './helpers';

test('a user can delete their own account from Settings → Account', async ({ page }) => {
  const email = `e2e-delete-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);
  // A Slack row needs no provider credentials to disconnect in CI: with no
  // stored token there is nothing to revoke, only rows to purge.
  await seedConnectedAccount(email, { provider: 'slack', providerTeamId: `T${Date.now()}` });

  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute(
    'href',
    '/settings/account',
  );
  // Navigate directly rather than clicking: a client-side navigation to a
  // route the dev server hasn't compiled yet races under parallel workers.
  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();

  const deleteButton = page.getByRole('button', { name: 'Delete my account' });
  await expect(deleteButton).toBeDisabled();
  await page.getByLabel(/type delete to confirm/i).fill('delete');
  await deleteButton.click();

  await expect(page).toHaveURL(/\/account-deleted$/);
  await expect(page.getByRole('heading', { name: /account has been deleted/i })).toBeVisible();

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  expect(profile).toBeNull();

  // The session is gone too: an app page now shows its signed-out state.
  await page.goto('/settings/connections');
  await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toBeVisible();
});
