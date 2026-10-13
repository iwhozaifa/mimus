import { getConnector } from '@/src/server/connectors/bootstrap';
import { MICROSOFT_OAUTH_NONCE_COOKIE } from '@/src/server/connectors/cookies';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';

// Kept thin and untested by vitest -- see google/start/route.ts's comment.

// ?access=write asks for the send-and-book permissions on top of the read
// ones, for the account named in ?account= (see writeScopes.ts).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const write = params.get('access') === 'write';
  const loginHint = params.get('account') ?? undefined;

  const context = await getCurrentWorkspaceContext();
  if (!context) {
    redirect('/sign-in');
  }

  const nonce = randomUUID();
  const state = Buffer.from(
    JSON.stringify({ workspaceId: context.workspaceId, userId: context.userId, nonce, write }),
  ).toString('base64url');

  (await cookies()).set(MICROSOFT_OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  let authUrl: string;
  try {
    authUrl = await getConnector('microsoft').getAuthUrl(state, { write, loginHint });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Microsoft OAuth is not configured')) {
      redirect('/settings/connections?error=microsoft_not_configured');
    }
    throw err;
  }
  redirect(authUrl);
}
