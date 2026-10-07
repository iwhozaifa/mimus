import { createClient } from '@/src/db/server';
import { acceptInvite } from '@/src/server/invites/acceptInvite';
import Link from 'next/link';
import { connection } from 'next/server';

// Inherently a one-time, fully dynamic action (token param, session cookie,
// a DB write) -- not a candidate for a prerendered shell.
export const instant = false;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
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

  if (!userId) {
    return (
      <Card>
        <p className="mb-4 text-sm text-slate-700">Sign in to accept this invite.</p>
        <Link
          href={`/sign-in?next=/invite/${token}`}
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          Sign in
        </Link>
      </Card>
    );
  }

  try {
    await acceptInvite({ token, userId });
  } catch (error) {
    return (
      <Card>
        <p className="text-sm text-red-600">
          {error instanceof Error ? error.message : 'Could not accept invite.'}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="mb-4 text-sm text-slate-700">You&apos;ve joined the workspace.</p>
      <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-500">
        Go to Mimus
      </Link>
    </Card>
  );
}
