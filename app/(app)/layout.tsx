import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { SignOutButton } from '../sign-out-button';
import { NavLinks } from './nav-links';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:flex-row">
        <aside className="w-full shrink-0 md:w-56">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <Link href="/dashboard" className="mb-4 block text-lg font-semibold text-slate-900">
              Mimus
            </Link>
            <NavLinks />
            <div className="mt-4 border-t border-slate-200 pt-4">
              <Suspense fallback={<p className="text-xs text-slate-400">Loading…</p>}>
                <IdentityStrip />
              </Suspense>
            </div>
          </div>
        </aside>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

async function IdentityStrip() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return (
      <Link href="/sign-in" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        Sign in
      </Link>
    );
  }

  return <SignOutButton />;
}
