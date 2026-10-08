import { expect, test } from '@playwright/test';
import { latestInviteToken, latestMagicLink, signInViaMagicLink } from './helpers';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

test('owner invites, promotes, and removes a teammate through real RLS', async ({
  page,
  browser,
}) => {
  const ownerEmail = `e2e-members-owner-${Date.now()}@example.com`;
  const inviteeEmail = `e2e-members-invitee-${Date.now()}@example.com`;

  await signInViaMagicLink(page, ownerEmail);
  await page.goto('/members');

  await page.getByLabel('Email').fill(inviteeEmail);
  await page.getByRole('button', { name: /send invite/i }).click();
  // The form clears its own email field on success, proving the invite
  // action resolved rather than threw.
  await expect(page.getByLabel('Email')).toHaveValue('');

  const inviteToken = await latestInviteToken(inviteeEmail);
  const inviteLink = `${BASE_URL}/invite/${inviteToken}`;

  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();

  await inviteePage.goto(inviteLink);
  await inviteePage.getByRole('link', { name: 'Sign in' }).click();
  await inviteePage.getByLabel('Email').fill(inviteeEmail);
  await inviteePage.getByRole('button', { name: /send magic link/i }).click();
  await expect(inviteePage.getByText(/check your email/i)).toBeVisible();

  const magicLink = await latestMagicLink(inviteeEmail);
  await inviteePage.goto(magicLink);
  await expect(inviteePage.getByText(/joined the workspace/i)).toBeVisible();
  await inviteeContext.close();

  await page.reload();
  const row = page.getByRole('listitem').filter({ hasText: inviteeEmail });
  await expect(row).toBeVisible();
  await expect(row.getByRole('combobox')).toHaveValue('member');

  await row.getByRole('combobox').selectOption('manager');
  await expect(row.getByRole('combobox')).toHaveValue('manager');
  // RoleSelect's onChange awaits the server action and only re-enables the
  // select once it resolves -- wait for that before reloading, otherwise
  // the reload can race the still-in-flight write and read back the old role.
  await expect(row.getByRole('combobox')).not.toBeDisabled();

  // Reload to prove the role change was persisted through the real
  // RLS-respecting write path (migration 0011's UPDATE policy), not just
  // held in client-side state.
  await page.reload();
  const rowAfterReload = page.getByRole('listitem').filter({ hasText: inviteeEmail });
  await expect(rowAfterReload.getByRole('combobox')).toHaveValue('manager');

  await rowAfterReload.getByRole('button', { name: /remove/i }).click();
  await expect(page.getByRole('listitem').filter({ hasText: inviteeEmail })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('listitem').filter({ hasText: inviteeEmail })).toHaveCount(0);
});
