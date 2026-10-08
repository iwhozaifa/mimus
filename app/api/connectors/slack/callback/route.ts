import { getConnector } from '@/src/server/connectors/bootstrap';
import { SLACK_OAUTH_NONCE_COOKIE } from '@/src/server/connectors/cookies';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

// Kept thin and untested by vitest -- see the start route's comment.
//
// Unlike Google/Microsoft's callback, this doesn't kick off a backfill
// yet -- that lands in the next M3 task (Slack backfill + message
// normalization). Connecting today only stores the token; nothing reads
// Slack content until that task ships.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const oauthError = searchParams.get('error');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (oauthError || !code || !state) {
    redirect('/settings/connections?error=slack_denied');
  }

  const cookieStore = await cookies();
  const nonceCookie = cookieStore.get(SLACK_OAUTH_NONCE_COOKIE)?.value;
  cookieStore.delete(SLACK_OAUTH_NONCE_COOKIE);

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
    redirect('/settings/connections?error=slack_invalid_state');
  }

  try {
    await getConnector('slack').handleOAuthCallback({
      workspaceId: decoded.workspaceId,
      userId: decoded.userId,
      code,
      state,
    });
  } catch (err) {
    console.error('Slack OAuth callback failed', err);
    redirect('/settings/connections?error=slack_connect_failed');
  }

  redirect('/settings/connections');
}
