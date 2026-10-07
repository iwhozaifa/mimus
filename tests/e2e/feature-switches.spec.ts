import { createServiceClient } from '@/src/db/service';
import { expect, test } from '@playwright/test';
import { signInViaMagicLink } from './helpers';

test('owner toggles a feature switch and it persists through real RLS', async ({ page }) => {
  const ownerEmail = `e2e-fs-owner-${Date.now()}@example.com`;
  await signInViaMagicLink(page, ownerEmail);
  await page.goto('/feature-switches');

  await expect(page.getByRole('heading', { name: 'Feature switches' })).toBeVisible();

  const moneyToggle = page.getByRole('checkbox', { name: /money/i });
  await expect(moneyToggle).not.toBeChecked();

  await moneyToggle.click();
  await expect(moneyToggle).toBeChecked();

  // Reload to prove the toggle was written under the owner's own session
  // through the real `manage_feature_switches` RLS policy, not just held
  // in client-side state.
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /money/i })).toBeChecked();
});

// Seeds the member's workspace_members row via the service client *before*
// their first sign-in, rather than going through the real /invite/[token]
// accept flow: a brand new user who signs in via magic link always gets
// their own auto-provisioned workspace first (app/auth/callback/route.ts
// calls createWorkspaceForNewUser before honoring `next`), and only then
// would acceptInvite() add a second workspace_members row for the invited
// workspace. getCurrentWorkspaceContext()'s unordered `.limit(1)` then
// resolves to whichever row comes back first -- in practice the user's own
// owner row, not the invited member row. That's a real latent bug in the
// invite-accept flow (multi-workspace membership isn't actually supported
// anywhere else in the app), out of scope for this task, and reported
// separately. Pre-seeding the membership sidesteps it: with a membership
// already in place, create_default_workspace_for_user's own "already a
// member somewhere" check skips auto-provisioning entirely, so this user
// ends up with exactly the one row this test cares about.
test('a non-owner member sees a gated message instead of controls', async ({ page, browser }) => {
  const ownerEmail = `e2e-fs-owner2-${Date.now()}@example.com`;
  const memberEmail = `e2e-fs-member-${Date.now()}@example.com`;

  await signInViaMagicLink(page, ownerEmail);

  const supabase = createServiceClient();
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', ownerEmail)
    .single()
    .throwOnError();
  const { data: ownerMembership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', ownerProfile!.id)
    .single()
    .throwOnError();

  const { data: created } = await supabase.auth.admin.createUser({
    email: memberEmail,
    email_confirm: true,
  });
  const { error: memberError } = await supabase.from('workspace_members').insert({
    workspace_id: ownerMembership!.workspace_id,
    user_id: created!.user!.id,
    role: 'member',
  });
  if (memberError) throw memberError;

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signInViaMagicLink(memberPage, memberEmail);

  await memberPage.goto('/feature-switches');
  await expect(
    memberPage.getByText(/only workspace owners can manage feature switches/i),
  ).toBeVisible();
  await expect(memberPage.getByRole('checkbox')).toHaveCount(0);

  await memberContext.close();
});
