import { expect, test } from '@playwright/test';
import { seedConnectedAccount, signInViaMagicLink } from './helpers';

// Google's OAuth client is app-level config set once per deployment: a dev
// machine usually has it in .env.local, CI never does. The page must
// handle both, so these tests assert whichever state applies.
const googleConfigured = Boolean(
  process.env.GOOGLE_OAUTH_CLIENT_ID &&
  process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
  process.env.GOOGLE_OAUTH_REDIRECT_URI,
);
const slackConfigured = Boolean(
  process.env.SLACK_CLIENT_ID &&
  process.env.SLACK_CLIENT_SECRET &&
  process.env.SLACK_OAUTH_REDIRECT_URI,
);

test('changing a connected account visibility and disconnecting persists through RLS', async ({
  page,
}) => {
  const email = `e2e-connections-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);
  await seedConnectedAccount(email);

  await page.goto('/settings/connections');

  const row = page.getByRole('listitem').filter({ hasText: 'Google Gmail' });
  await expect(row).toBeVisible();
  await expect(page.getByRole('group', { name: email })).toBeVisible();
  await expect(row.getByRole('combobox')).toHaveValue('private');

  await row.getByRole('combobox').selectOption('team');
  await expect(row.getByRole('combobox')).toHaveValue('team');

  // Reload to prove the change was persisted through the real RLS-respecting
  // write path (this page uses the signed-in user's own session, not a
  // service-role bypass), not just held in client-side state. The select's
  // onChange fires the update as an unawaited Server Action call, so retry
  // the reload+check instead of assuming it has already landed.
  let rowAfterReload = page.getByRole('listitem').filter({ hasText: 'Google Gmail' });
  await expect(async () => {
    await page.reload();
    rowAfterReload = page.getByRole('listitem').filter({ hasText: 'Google Gmail' });
    await expect(rowAfterReload.getByRole('combobox')).toHaveValue('team');
  }).toPass({ timeout: 10_000 });

  await rowAfterReload.getByRole('button', { name: /disconnect/i }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Google Gmail' })).toHaveCount(0);
});

test('several Google accounts each show as Google Gmail and Google Calendar under their address', async ({
  page,
}) => {
  const email = `e2e-connections-multi-${Date.now()}@example.com`;
  const work = `work-${Date.now()}@example.com`;
  const personal = `personal-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);
  for (const externalAccountId of [work, personal]) {
    await seedConnectedAccount(email, { accountType: 'email', externalAccountId });
    await seedConnectedAccount(email, { accountType: 'calendar', externalAccountId });
  }

  await page.goto('/settings/connections');

  for (const address of [work, personal]) {
    const group = page.getByRole('group', { name: address });
    await expect(group.getByRole('listitem').filter({ hasText: 'Google Gmail' })).toHaveCount(1);
    await expect(group.getByRole('listitem').filter({ hasText: 'Google Calendar' })).toHaveCount(1);
  }

  if (googleConfigured) {
    await expect(page.getByRole('link', { name: /add another google account/i })).toHaveAttribute(
      'href',
      '/api/connectors/google/start',
    );
  }
});

test('the Connect Google account link points at the OAuth start route when Google is configured', async ({
  page,
}) => {
  const email = `e2e-connections-link-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);

  await page.goto('/settings/connections');
  await expect(page.getByRole('heading', { name: 'Gmail & Google Calendar' })).toBeVisible();

  if (googleConfigured) {
    await expect(page.getByRole('link', { name: /connect google account/i })).toHaveAttribute(
      'href',
      '/api/connectors/google/start',
    );
  } else {
    await expect(page.getByText(/isn't set up on this deployment/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /connect google account/i })).toHaveCount(0);
  }
});

test('several Slack workspaces each show as their own named connection', async ({ page }) => {
  const email = `e2e-connections-slack-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);
  const workspaces = [
    { id: `T_ACME_${Date.now()}`, name: 'Acme Corp', domain: 'acme.slack.com' },
    { id: `T_GLOBEX_${Date.now()}`, name: 'Globex', domain: 'globex.slack.com' },
  ];
  for (const workspace of workspaces) {
    await seedConnectedAccount(email, {
      provider: 'slack',
      externalAccountId: 'U_E2E',
      providerTeamId: workspace.id,
      providerTeamName: workspace.name,
      providerTeamDomain: workspace.domain,
    });
  }

  await page.goto('/settings/connections');
  await expect(page.getByRole('heading', { name: 'Slack', exact: true })).toBeVisible();

  for (const workspace of workspaces) {
    const group = page.getByRole('group', { name: workspace.name });
    await expect(group.getByText(workspace.domain)).toBeVisible();
    await expect(group.getByRole('listitem').filter({ hasText: 'Slack' })).toHaveCount(1);
  }

  if (slackConfigured) {
    await expect(page.getByRole('link', { name: /add another slack workspace/i })).toHaveAttribute(
      'href',
      '/api/connectors/slack/start',
    );
  } else {
    await expect(page.getByText(/slack connection isn't set up/i)).toBeVisible();
  }
});

test('the Connect Slack workspace link points at the OAuth start route when Slack is configured', async ({
  page,
}) => {
  const email = `e2e-connections-slack-link-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);

  await page.goto('/settings/connections');

  if (slackConfigured) {
    await expect(page.getByRole('link', { name: /connect slack workspace/i })).toHaveAttribute(
      'href',
      '/api/connectors/slack/start',
    );
  } else {
    await expect(page.getByText(/slack connection isn't set up/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /connect slack/i })).toHaveCount(0);
  }
});
