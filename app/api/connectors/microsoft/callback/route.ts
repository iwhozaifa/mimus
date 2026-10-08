import { getConnector } from '@/src/server/connectors/bootstrap';
import { MICROSOFT_OAUTH_NONCE_COOKIE } from '@/src/server/connectors/cookies';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after, type NextRequest } from 'next/server';

// Kept thin and untested by vitest -- see google/callback/route.ts's comment.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const oauthError = searchParams.get('error');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (oauthError || !code || !state) {
    redirect('/settings/connections?error=microsoft_denied');
  }

  const cookieStore = await cookies();
  const nonceCookie = cookieStore.get(MICROSOFT_OAUTH_NONCE_COOKIE)?.value;
  cookieStore.delete(MICROSOFT_OAUTH_NONCE_COOKIE);

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
    redirect('/settings/connections?error=microsoft_invalid_state');
  }

  let rows;
  try {
    rows = await getConnector('microsoft').handleOAuthCallback({
      workspaceId: decoded.workspaceId,
      userId: decoded.userId,
      code,
      state,
    });
  } catch (err) {
    console.error('Microsoft OAuth callback failed', err);
    redirect('/settings/connections?error=microsoft_connect_failed');
  }

  // Runs after the redirect response is sent -- see google/callback/route.ts's
  // comment.
  for (const row of rows) {
    after(() =>
      getConnector('microsoft')
        .backfill(row.id)
        .catch((err) => console.error(`Microsoft backfill failed for account ${row.id}`, err)),
    );
  }

  redirect('/settings/connections');
}
