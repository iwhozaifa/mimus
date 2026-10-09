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

// Seeds a connected_accounts row directly via the service client, standing
// in for a real Google OAuth round-trip -- no environment here (local or
// CI) has a real Google Cloud project configured yet, so e2e coverage of
// the connections page's visibility-toggle/disconnect flows seeds data
// this way rather than driving the actual OAuth consent screen. Must run
// after the user has signed in at least once, since the workspace doesn't
// exist until auto-provisioning runs on their first magic-link verification.
export async function seedConnectedAccount(
  email: string,
  {
    accountType = 'email',
    externalAccountId = email,
  }: { accountType?: 'email' | 'calendar'; externalAccountId?: string } = {},
): Promise<string> {
  const supabase = createServiceClient();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();
  if (profileError) throw profileError;

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', profile!.id)
    .single();
  if (membershipError) throw membershipError;

  const { data: account, error: accountError } = await supabase
    .from('connected_accounts')
    .insert({
      workspace_id: membership!.workspace_id,
      owner_user_id: profile!.id,
      provider: 'google',
      account_type: accountType,
      external_account_id: externalAccountId,
    })
    .select('id')
    .single();
  if (accountError) throw accountError;

  return account!.id as string;
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
