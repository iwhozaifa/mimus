import { getConnector } from '@/src/server/connectors/bootstrap';
import { MICROSOFT_OAUTH_NONCE_COOKIE } from '@/src/server/connectors/cookies';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';

// Kept thin and untested by vitest -- see google/start/route.ts's comment.

export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    redirect('/sign-in');
  }

  const nonce = randomUUID();
  const state = Buffer.from(
    JSON.stringify({ workspaceId: context.workspaceId, userId: context.userId, nonce }),
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
    authUrl = await getConnector('microsoft').getAuthUrl(state);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Microsoft OAuth is not configured')) {
      redirect('/settings/connections?error=microsoft_not_configured');
    }
    throw err;
  }
  redirect(authUrl);
}
