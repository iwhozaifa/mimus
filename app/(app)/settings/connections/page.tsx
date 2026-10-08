import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { disconnectAccount } from './actions';
import { VisibilitySelect } from './visibility-select';

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
      <ConnectionsList />
    </Suspense>
  );
}

async function ConnectionsList() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return (
      <Card>
        <Link
          href="/sign-in?next=/settings/connections"
          className="font-medium text-accent-strong hover:text-accent"
        >
          Sign in
        </Link>
      </Card>
    );
  }

  const { supabase, workspaceId } = context;

  const { data: accounts } = await supabase
    .from('connected_accounts')
    .select('id, provider, visibility, status')
    .eq('workspace_id', workspaceId)
    .eq('status', 'connected');

  return (
    <Card>
      <h1 className="mb-4 text-2xl font-semibold text-ink">Connections</h1>
      <ul className="mb-6 flex flex-col divide-y divide-line-muted">
        {(accounts ?? []).map((account) => (
          <li
            key={account.id}
            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <span className="font-medium text-ink capitalize">{account.provider}</span>
            <div className="flex items-center gap-3">
              <VisibilitySelect
                accountId={account.id}
                visibility={account.visibility as 'private' | 'team' | 'company'}
              />
              <DisconnectButton accountId={account.id} />
            </div>
          </li>
        ))}
        {(accounts ?? []).length === 0 && (
          <li className="text-sm text-ink-muted">No connected accounts yet.</li>
        )}
      </ul>
      <div className="flex gap-3">
        <Link
          href="/api/connectors/google/start"
          className="inline-flex rounded-md bg-ink px-4 py-2 text-sm font-medium text-ink-foreground transition-colors hover:bg-ink/90"
        >
          Connect Google
        </Link>
        <Link
          href="/api/connectors/microsoft/start"
          className="inline-flex rounded-md bg-ink px-4 py-2 text-sm font-medium text-ink-foreground transition-colors hover:bg-ink/90"
        >
          Connect Microsoft
        </Link>
      </div>
    </Card>
  );
}

function DisconnectButton({ accountId }: { accountId: string }) {
  async function onSubmit() {
    'use server';
    await disconnectAccount(accountId);
  }

  return (
    <form action={onSubmit}>
      <Button variant="danger" size="sm" type="submit">
        Disconnect
      </Button>
    </form>
  );
}
