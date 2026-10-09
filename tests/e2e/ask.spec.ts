import { createServiceClient } from '@/src/db/service';
import { upsertMessage } from '@/src/server/shared/normalize';
import { expect, test } from '@playwright/test';
import { seedConnectedAccount, signInViaMagicLink } from './helpers';

async function seedMessage(email: string, subject: string): Promise<string> {
  const accountId = await seedConnectedAccount(email);
  const { data: account } = await createServiceClient()
    .from('connected_accounts')
    .select('workspace_id')
    .eq('id', accountId)
    .single()
    .throwOnError();
  return upsertMessage(account!.workspace_id as string, accountId, {
    providerMessageId: `e2e-${Date.now()}`,
    subject,
    bodyText: 'Please sign the lease renewal by Friday.',
    direction: 'inbound',
    sentAt: new Date().toISOString(),
    from: { email: 'landlord@example.com', displayName: 'Landlord' },
  });
}

test('asking Mimus shows the answer with sources that open the real message', async ({ page }) => {
  const email = `e2e-ask-${Date.now()}@example.com`;
  await signInViaMagicLink(page, email);
  const messageId = await seedMessage(email, 'Lease renewal');

  // The model call is the one stubbed boundary (no Anthropic key in CI);
  // askMimus itself is covered against the real DB in vitest.
  await page.route('**/api/agent/ask', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ question: 'what about the lease?' });
    await route.fulfill({
      json: {
        status: 'ok',
        answer: 'Your landlord wants the lease renewal signed by Friday.',
        module: 'lookup',
        tier: 'fast',
        logId: 'x',
        sources: [
          {
            kind: 'message',
            id: messageId,
            title: 'Lease renewal',
            timestamp: new Date().toISOString(),
            provider: 'google',
          },
        ],
      },
    });
  });

  await page.goto('/sky');
  const askBox = page.getByRole('textbox', { name: 'Ask Mimus' });
  const answer = page.getByRole('region', { name: 'Mimus answer' });
  // Typing before the ask bar hydrates is lost (React resets the controlled
  // input, and Enter does a plain form submit), so retry until it takes.
  await expect(async () => {
    await askBox.fill('what about the lease?');
    await askBox.press('Enter');
    await expect(answer).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(answer).toContainText('signed by Friday');
  await answer.getByRole('link', { name: /Lease renewal/ }).click();

  // Generous timeout: on a cold `next dev` the first visit compiles the route.
  await expect(page).toHaveURL(`/sources/message/${messageId}`, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Lease renewal' })).toBeVisible();
  await expect(page.getByText('From Landlord <landlord@example.com>')).toBeVisible();
});

test("a source link to someone else's private message is not found", async ({ page }) => {
  const owner = `e2e-ask-owner-${Date.now()}@example.com`;
  const outsider = `e2e-ask-outsider-${Date.now()}@example.com`;
  await signInViaMagicLink(page, owner);
  const messageId = await seedMessage(owner, 'Private board notes');

  await page.context().clearCookies();
  await signInViaMagicLink(page, outsider);
  await page.goto(`/sources/message/${messageId}`);

  await expect(page.getByText('Private board notes')).toHaveCount(0);
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});
