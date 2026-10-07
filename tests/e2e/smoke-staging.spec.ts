import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

// Runs against the real staging Supabase project (not local Mailpit), so
// magic links are minted directly via the admin API instead of waiting on
// real email delivery -- this test is meant to be run with env vars pointed
// at staging (see .env.staging), not local dev.

function stagingClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
}

async function signInViaGeneratedLink(
  page: import('@playwright/test').Page,
  email: string,
  baseUrl: string,
) {
  const supabase = stagingClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${baseUrl}/auth/callback` },
  });
  if (error) throw error;

  // admin.generateLink doesn't go through PKCE, so it's verified via
  // token_hash/type rather than following the action_link's own `code`-less
  // redirect chain (which our app, PKCE-only on that path, can't consume).
  await page.goto(
    `${baseUrl}/auth/callback?token_hash=${data.properties.hashed_token}&type=${data.properties.verification_type}`,
  );
}

test('staging smoke: sign up, invite, accept, toggle visibility', async ({ page, baseURL }) => {
  const supabase = stagingClient();
  const url = baseURL ?? 'http://127.0.0.1:3000';
  const ownerEmail = `staging-owner-${Date.now()}@example.com`;
  // Resend's sandbox (no verified domain yet) only accepts sending to the
  // account's own registered address -- override via env for a real send;
  // defaults to a synthetic address once a domain is verified and this
  // restriction no longer applies.
  const inviteeEmail =
    process.env.STAGING_TEST_RECIPIENT_EMAIL ?? `staging-invitee-${Date.now()}@example.com`;

  // Sign up -> workspace auto-created.
  await signInViaGeneratedLink(page, ownerEmail, url);
  await expect(page.getByText(ownerEmail)).toBeVisible();

  const { data: ownerUser } = await supabase.auth.admin.listUsers();
  const owner = ownerUser.users.find((u) => u.email === ownerEmail);
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', owner!.id)
    .single();
  const workspaceId = membership!.workspace_id as string;

  // Invite (no UI yet -- call the server function directly, same as a
  // future Settings page would).
  const { createInvite } = await import('@/src/server/invites/createInvite');
  const invite = await createInvite({
    workspaceId,
    workspaceName: 'Smoke test workspace',
    invitedByUserId: owner!.id,
    email: inviteeEmail,
    role: 'member',
    baseUrl: url,
  });

  // Invitee signs up (their own separate workspace gets auto-created too),
  // then accepts the invite into the owner's workspace.
  const inviteePage = page;
  await signInViaGeneratedLink(inviteePage, inviteeEmail, url);
  await inviteePage.goto(`/invite/${invite.token}`);
  await expect(inviteePage.getByText(/joined the workspace/i)).toBeVisible();

  const { data: inviteeUser } = await supabase.auth.admin.listUsers();
  const invitee = inviteeUser.users.find((u) => u.email === inviteeEmail);
  const { data: inviteeMemberships } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', invitee!.id);
  // At least 2 (their own auto-created workspace + this invite) -- not
  // exactly 2, since a reused recipient address may carry memberships from
  // earlier runs.
  expect(inviteeMemberships!.length).toBeGreaterThanOrEqual(2);
  expect(inviteeMemberships?.some((m) => m.workspace_id === workspaceId)).toBe(true);

  // Toggle connection visibility, as the owner, through the real UI.
  await signInViaGeneratedLink(page, ownerEmail, url);
  await page.goto('/settings/connections');
  await page.getByRole('button', { name: /connect test account/i }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'google' });
  await row.getByRole('combobox').selectOption('team');
  await page.reload();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'google' }).getByRole('combobox'),
  ).toHaveValue('team');
});
