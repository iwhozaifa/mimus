import { getConnector } from '@/src/server/connectors/bootstrap';
import { CALENDLY_OAUTH_NONCE_COOKIE } from '@/src/server/connectors/cookies';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';

// Kept thin and untested by vitest -- see Google's start route's comment.
export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    redirect('/sign-in');
  }

  const nonce = randomUUID();
  const state = Buffer.from(
    JSON.stringify({ workspaceId: context.workspaceId, userId: context.userId, nonce }),
  ).toString('base64url');

  (await cookies()).set(CALENDLY_OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  let authUrl: string;
  try {
    authUrl = await getConnector('calendly').getAuthUrl(state);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Calendly OAuth is not configured')) {
      redirect('/settings/connections?error=calendly_not_configured');
    }
    throw err;
  }
  redirect(authUrl);
}
