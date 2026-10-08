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

export async function GET() {
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
    JSON.stringify({ workspaceId: context.workspaceId, userId: context.userId, nonce }),
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
    authUrl = await getConnector('google').getAuthUrl(state);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Google OAuth is not configured')) {
      redirect('/settings/connections?error=google_not_configured');
    }
    throw err;
  }
  redirect(authUrl);
}
