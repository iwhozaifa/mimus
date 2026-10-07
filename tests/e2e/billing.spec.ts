import { createServiceClient } from '@/src/db/service';
import { expect, test } from '@playwright/test';
import { signInViaMagicLink } from './helpers';

// The global `plans` table isn't guaranteed empty here -- other vitest
// suites (e.g. featureSwitches.test.ts) insert rows into it and nothing
// resets the local DB between `npm run test` and the Playwright run. So
// this asserts against whatever the real row count is, rather than
// assuming zero.
test('billing page renders either the empty-plans state or a real plan list', async ({ page }) => {
  const email = `e2e-billing-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);
  await page.goto('/billing');

  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();

  const supabase = createServiceClient();
  const { count } = await supabase.from('plans').select('id', { count: 'exact', head: true });

  if (!count) {
    await expect(page.getByText('No plans configured yet.')).toBeVisible();
  } else {
    await expect(page.getByText('No plans configured yet.')).toHaveCount(0);
    await expect(page.getByRole('listitem').first()).toBeVisible();
  }
});

test('a read-only workspace shows the banner on Sky and billing', async ({ page }) => {
  const email = `e2e-billing-readonly-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);
  await expect(page).toHaveURL(/\/sky$/);

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()
    .throwOnError();
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', profile!.id)
    .single()
    .throwOnError();
  await supabase
    .from('workspace_subscriptions')
    .insert({ workspace_id: membership!.workspace_id, status: 'past_due' })
    .throwOnError();

  const bannerText = /read-only because billing is past due or canceled/i;

  await page.reload();
  await expect(page.getByText(bannerText)).toBeVisible();

  await page.goto('/billing');
  await expect(page.getByText(bannerText)).toBeVisible();
});
