import { getConnector } from '@/src/server/connectors/bootstrap';
import { GOOGLE_OAUTH_NONCE_COOKIE } from '@/src/server/connectors/cookies';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';

// Kept thin and untested by vitest -- the logic worth unit-testing lives in
// src/server/connectors/google/{oauth,connect}.ts; this route only wires
// request/cookie/redirect plumbing that's exercised by Playwright e2e and
// manual testing instead (same split already used by app/auth/callback).

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

  // Random nonce bound to this browser via an httpOnly cookie, echoed back
  // inside the OAuth `state` param -- the callback rejects any state whose
  // nonce doesn't match the cookie, which is the standard CSRF defense for
  // the OAuth authorization-code flow.
  const nonce = randomUUID();
  const state = Buffer.from(
    JSON.stringify({ workspaceId: context.workspaceId, userId: context.userId, nonce, write }),
  ).toString('base64url');

  (await cookies()).set(GOOGLE_OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  let authUrl: string;
  try {
    authUrl = await getConnector('google').getAuthUrl(state, { write, loginHint });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Google OAuth is not configured')) {
      redirect('/settings/connections?error=google_not_configured');
    }
    throw err;
  }
  redirect(authUrl);
}
