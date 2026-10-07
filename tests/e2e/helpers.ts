import { expect, type Page } from '@playwright/test';

const MAILPIT_URL = 'http://127.0.0.1:54324';

async function latestMagicLink(toAddress: string): Promise<string> {
  let messageId: string | undefined;

  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT_URL}/api/v1/messages`);
        const data = await res.json();
        const match = data.messages?.find((m: { To: { Address: string }[] }) =>
          m.To.some((to) => to.Address === toAddress),
        );
        messageId = match?.ID;
        return Boolean(messageId);
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  const message = await (await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`)).json();
  const body: string = message.Text ?? message.HTML ?? '';
  const match = body.match(/https?:\/\/\S+verify\S+/);
  if (!match) {
    throw new Error(`No magic link found in email body: ${body}`);
  }
  return match[0].replace(/[)\s]+$/, '');
}

export async function signInViaMagicLink(page: Page, email: string): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });

  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: /send magic link/i }).click();
  await expect(page.getByText(/check your email/i)).toBeVisible();

  const link = await latestMagicLink(email);
  await page.goto(link);
}
