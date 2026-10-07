import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md rounded-card border border-line-muted bg-paper-raised p-8">
        <h1 className="mb-6 text-2xl font-semibold text-ink">Mimus</h1>
        <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
          <AuthStatus />
        </Suspense>
      </div>
    </main>
  );
}

async function AuthStatus() {
  // Marks this as request-time rendering before getClaims() checks the JWT's
  // expiry against Date.now() -- otherwise Next's prerender analysis flags
  // that clock read as an unstable value, even inside this Suspense boundary.
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return (
      <Link href="/sign-in" className="font-medium text-accent-strong hover:text-accent">
        Sign in
      </Link>
    );
  }

  redirect('/sky');
}
