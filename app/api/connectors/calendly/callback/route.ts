import { getConnector } from '@/src/server/connectors/bootstrap';
import { CALENDLY_OAUTH_NONCE_COOKIE } from '@/src/server/connectors/cookies';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after, type NextRequest } from 'next/server';

// Kept thin and untested by vitest -- see the start route's comment.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const oauthError = searchParams.get('error');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (oauthError || !code || !state) {
    redirect('/settings/connections?error=calendly_denied');
  }

  const cookieStore = await cookies();
  const nonceCookie = cookieStore.get(CALENDLY_OAUTH_NONCE_COOKIE)?.value;
  cookieStore.delete(CALENDLY_OAUTH_NONCE_COOKIE);

  let decoded: { workspaceId: string; userId: string; nonce: string } | null = null;
  try {
    decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
  } catch {
    decoded = null;
  }

  const context = await getCurrentWorkspaceContext();

  if (
    !decoded ||
    !nonceCookie ||
    decoded.nonce !== nonceCookie ||
    !context ||
    context.userId !== decoded.userId ||
    context.workspaceId !== decoded.workspaceId
  ) {
    redirect('/settings/connections?error=calendly_invalid_state');
  }

  let rows;
  try {
    rows = await getConnector('calendly').handleOAuthCallback({
      workspaceId: decoded.workspaceId,
      userId: decoded.userId,
      code,
      state,
    });
  } catch (err) {
    console.error('Calendly OAuth callback failed', err);
    redirect('/settings/connections?error=calendly_connect_failed');
  }

  // Runs after the redirect response is sent -- same rationale as
  // Google/Microsoft/Slack's callback: backfilling every scheduled event
  // in the sync window is too slow to block the OAuth round-trip on.
  //
  // Also registers this account's webhook subscription here, once, at
  // connect time -- unlike Google/Microsoft's watch()/subscription (which
  // ride the renewal cron's "due" query even for a brand-new account) or
  // Slack's single static app-wide subscription, Calendly needs its own
  // per-account registration call and that subscription doesn't expire,
  // so there's nothing for a renewal cron to do here. Expected to fail
  // (logged, not fatal) until CALENDLY_WEBHOOK_URL is actually configured
  // -- same "code-complete, not live yet" posture as every other
  // provider's push-notification setup.
  for (const row of rows) {
    after(() =>
      getConnector('calendly')
        .backfill(row.id)
        .catch((err) => console.error(`Calendly backfill failed for account ${row.id}`, err)),
    );
    const registerWebhook = getConnector('calendly').registerWebhook;
    if (registerWebhook) {
      after(() =>
        registerWebhook(row.id).catch((err) =>
          console.error(`Calendly webhook registration failed for account ${row.id}`, err),
        ),
      );
    }
  }

  redirect('/settings/connections');
}
