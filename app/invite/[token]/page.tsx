import { createClient } from '@/src/db/server';
import { acceptInvite } from '@/src/server/invites/acceptInvite';
import Link from 'next/link';

// Inherently a one-time, fully dynamic action (token param, session cookie,
// a DB write) -- not a candidate for a prerendered shell.
export const instant = false;

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub as string | undefined;

  if (!userId) {
    return (
      <main>
        <p>Sign in to accept this invite.</p>
        <Link href={`/sign-in?next=/invite/${token}`}>Sign in</Link>
      </main>
    );
  }

  try {
    await acceptInvite({ token, userId });
  } catch (error) {
    return <main>{error instanceof Error ? error.message : 'Could not accept invite.'}</main>;
  }

  return (
    <main>
      <p>You&apos;ve joined the workspace.</p>
      <Link href="/">Go to Mimus</Link>
    </main>
  );
}
