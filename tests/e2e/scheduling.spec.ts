import { expect, test } from '@playwright/test';
import { seedConnectedAccount, seedInboundMessage, signInViaMagicLink } from './helpers';

test('Scheduling settings save the approval level and working hours', async ({ page }) => {
  const email = `e2e-sched-settings-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);

  await page.goto('/settings/scheduling');
  await expect(page.getByRole('heading', { level: 1, name: 'Scheduling' })).toBeVisible();
  // Level 2 is the default.
  await expect(page.getByLabel(/approve every send and booking/i)).toBeChecked();

  await page.getByLabel(/offers go out automatically/i).check();
  await page.getByLabel('Time zone').fill('Asia/Karachi');
  await page.getByLabel('Day starts').fill('10:00');
  await page.getByLabel('Day ends').fill('18:00');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel(/offers go out automatically/i)).toBeChecked();
  await expect(page.getByLabel('Time zone')).toHaveValue('Asia/Karachi');
  await expect(page.getByLabel('Day starts')).toHaveValue('10:00');
  await expect(page.getByLabel('Day ends')).toHaveValue('18:00');
});

test('proposing times from an email lands it in Approvals, where it can be rejected', async ({
  page,
}) => {
  const email = `e2e-sched-propose-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);
  const inbox = await seedConnectedAccount(email, { accountType: 'email' });
  const messageId = await seedInboundMessage(inbox, {
    subject: 'Coffee next week?',
    fromEmail: 'sam@client.example',
    fromName: 'Sam Rivera',
  });

  await page.goto(`/sources/message/${messageId}`);
  await page.getByRole('button', { name: 'Propose meeting times' }).click();

  await expect(page).toHaveURL(/\/approvals$/);
  const card = page.getByRole('article').filter({ hasText: 'Coffee next week?' });
  await expect(card).toBeVisible();
  await expect(card.getByText('sam@client.example')).toBeVisible();
  await expect(card.getByText('Hi Sam,')).toBeVisible();
  // This account never allowed sending, so it's a draft to send yourself.
  await expect(card.getByText(/allow sending and booking/i)).toBeVisible();

  await card.getByRole('button', { name: 'Dismiss' }).click();
  await expect(
    page.getByRole('region', { name: 'History' }).getByText('Coffee next week?'),
  ).toBeVisible();
});

test('approving without the send permission shows why, and keeps the proposal', async ({
  page,
}) => {
  const email = `e2e-sched-approve-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);
  // The scopes say "can send", so the proposal waits for approval -- but
  // the account has no stored credentials, so the send itself fails.
  const inbox = await seedConnectedAccount(email, {
    accountType: 'email',
    scopes: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  });
  const messageId = await seedInboundMessage(inbox, {
    subject: 'Quarterly review',
    fromEmail: 'cfo@client.example',
    fromName: 'Dana',
  });

  await page.goto(`/sources/message/${messageId}`);
  await page.getByRole('button', { name: 'Propose meeting times' }).click();
  const card = page.getByRole('article').filter({ hasText: 'Quarterly review' });
  await expect(card.getByText('Waiting for you')).toBeVisible();

  await card.getByRole('button', { name: 'Send these times' }).click();
  await expect(card.getByRole('alert')).toBeVisible();
  await expect(card.getByText('Waiting for you')).toBeVisible();
});

test('the avatar menu links to Approvals and Scheduling', async ({ page }) => {
  await signInViaMagicLink(page, `e2e-sched-menu-${Date.now()}@example.com`);
  await page.goto('/sky');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('link', { name: 'Approvals' })).toHaveAttribute('href', '/approvals');
  await expect(page.getByRole('link', { name: 'Scheduling' })).toHaveAttribute(
    'href',
    '/settings/scheduling',
  );
});
