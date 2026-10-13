import { createClient } from '@/src/db/server';
import { acceptInvite } from '@/src/server/invites/acceptInvite';
import { createWorkspaceForNewUser } from '@/src/server/workspaces/createWorkspace';
import Link from 'next/link';
import { connection } from 'next/server';
import { MimusLogo } from '@/components/brand/logo';

// Inherently a one-time, fully dynamic action (token param, session cookie,
// a DB write) -- not a candidate for a prerendered shell.
export const instant = false;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-paper px-4 py-12">
      <MimusLogo className="h-[34px] w-auto text-ink" />
      <div className="w-full max-w-sm rounded-card border border-line-muted bg-paper-raised p-6 text-center shadow-sm">
        {children}
      </div>
    </main>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub as string | undefined;
  const email = data?.claims.email as string | undefined;

  if (!userId) {
    return (
      <Card>
        <p className="mb-4 text-sm text-ink">Sign in to accept this invite.</p>
        <Link
          href={`/sign-in?next=/invite/${token}`}
          className="font-medium text-accent-strong hover:text-accent"
        >
          Sign in
        </Link>
      </Card>
    );
  }

  try {
    await acceptInvite({ token, userId });
  } catch (error) {
    // Sign-in skips auto-provisioning for a pending invite, so if the
    // invite stopped being acceptable since then (revoked, expired) give
    // the user their own workspace now. A no-op if they already have one.
    if (email) await createWorkspaceForNewUser(userId, email);
    return (
      <Card>
        <p className="mb-4 text-sm text-danger">
          {error instanceof Error ? error.message : 'Could not accept invite.'}
        </p>
        <Link href="/" className="font-medium text-accent-strong hover:text-accent">
          Go to Mimus
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <p className="mb-4 text-sm text-ink">You&apos;ve joined the workspace.</p>
      <Link href="/" className="font-medium text-accent-strong hover:text-accent">
        Go to Mimus
      </Link>
    </Card>
  );
}
