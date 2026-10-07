import { createServiceClient } from '@/src/db/service';
import { expect, type Page } from '@playwright/test';

const MAILPIT_URL = 'http://127.0.0.1:54324';

export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
}

async function latestLinkMatching(toAddress: string, pattern: RegExp): Promise<string> {
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
  const match = body.match(pattern);
  if (!match) {
    throw new Error(`No link matching ${pattern} found in email body: ${body}`);
  }
  return match[0].replace(/[)\s]+$/, '');
}

export async function latestMagicLink(toAddress: string): Promise<string> {
  return latestLinkMatching(toAddress, /https?:\/\/\S+verify\S+/);
}

// Invite emails go through Resend, not Supabase Auth's SMTP, so they never
// land in local Mailpit the way magic links do -- and no environment here
// (local or CI) has a real Resend key configured yet. Read the token
// straight from the DB instead, the same way vitest fixtures already use
// the service client for setup that doesn't need to go through RLS.
export async function latestInviteToken(email: string): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('invites')
    .select('token')
    .eq('email', email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`No pending invite found for ${email}`);
  return data.token as string;
}

export async function signInViaMagicLink(page: Page, email: string): Promise<void> {
  await clearMailbox();

  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: /send magic link/i }).click();
  await expect(page.getByText(/check your email/i)).toBeVisible();

  const link = await latestMagicLink(email);
  await page.goto(link);
}
