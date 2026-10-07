import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';

export default function AuditLogPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
      <AuditLogContent />
    </Suspense>
  );
}

async function AuditLogContent() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/sign-in?next=/audit-log"
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Audit log</h1>
      <p className="text-sm text-slate-500">
        Coming soon. Once the AI agent is live, every request it makes on this workspace&apos;s
        behalf will show up here — what it was asked, which model handled it, and what it cost.
      </p>
    </div>
  );
}
