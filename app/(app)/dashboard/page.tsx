import { isWorkspaceReadOnly } from '@/src/server/billing/killSwitch';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { ReadOnlyBanner } from '../read-only-banner';

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    redirect('/sign-in?next=/dashboard');
  }

  const readOnly = await isWorkspaceReadOnly(context.workspaceId);

  return (
    <div>
      <ReadOnlyBanner isReadOnly={readOnly} />
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">{context.workspaceName}</h1>
        <p className="mb-4 text-slate-600">
          Signed in as <span className="font-medium text-slate-900">{context.email}</span>
        </p>
        <span className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium capitalize text-indigo-700">
          {context.role}
        </span>
      </div>
    </div>
  );
}
