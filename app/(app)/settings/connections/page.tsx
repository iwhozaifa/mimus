import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { connectStubAccount, disconnectAccount } from './actions';
import { VisibilitySelect } from './visibility-select';

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
      <ConnectionsList />
    </Suspense>
  );
}

async function ConnectionsList() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/sign-in?next=/settings/connections"
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const { supabase, workspaceId } = context;

  const { data: accounts } = await supabase
    .from('connected_accounts')
    .select('id, provider, visibility, status')
    .eq('workspace_id', workspaceId)
    .eq('status', 'connected');

  async function connect() {
    'use server';
    await connectStubAccount();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Connections</h1>
      <ul className="mb-6 flex flex-col gap-3">
        {(accounts ?? []).map((account) => (
          <li
            key={account.id}
            className="flex items-center justify-between gap-4 rounded-md border border-slate-200 p-3"
          >
            <span className="font-medium capitalize text-slate-800">{account.provider}</span>
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
          <li className="text-sm text-slate-500">No connected accounts yet.</li>
        )}
      </ul>
      <form action={connect}>
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Connect test account (stub)
        </button>
      </form>
    </div>
  );
}

function DisconnectButton({ accountId }: { accountId: string }) {
  async function onSubmit() {
    'use server';
    await disconnectAccount(accountId);
  }

  return (
    <form action={onSubmit}>
      <button
        type="submit"
        className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Disconnect
      </button>
    </form>
  );
}
