import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';

export default function AuditLogPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
      <AuditLogContent />
    </Suspense>
  );
}

async function AuditLogContent() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return (
      <Card>
        <Link
          href="/sign-in?next=/audit-log"
          className="font-medium text-accent-strong hover:text-accent"
        >
          Sign in
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-2 text-2xl font-semibold text-ink">Audit log</h1>
      <p className="text-sm text-ink-muted">
        Coming soon. Once the AI agent is live, every request it makes on this workspace&apos;s
        behalf will show up here — what it was asked, which model handled it, and what it cost.
      </p>
    </Card>
  );
}
