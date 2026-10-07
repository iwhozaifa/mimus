import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">Mimus</h1>
        <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
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
      <Link href="/sign-in" className="font-medium text-indigo-600 hover:text-indigo-500">
        Sign in
      </Link>
    );
  }

  redirect('/dashboard');
}
