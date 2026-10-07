import { createClient } from '@/src/db/server';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { connectStubAccount, disconnectAccount } from './actions';
import { VisibilitySelect } from './visibility-select';

export default function ConnectionsPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ConnectionsList />
    </Suspense>
  );
}

async function ConnectionsList() {
  await connection();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub as string | undefined;

  if (!userId) {
    return (
      <main>
        <Link href="/sign-in?next=/settings/connections">Sign in</Link>
      </main>
    );
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (!membership) {
    return <main>No workspace found.</main>;
  }

  const { data: accounts } = await supabase
    .from('connected_accounts')
    .select('id, provider, visibility, status')
    .eq('workspace_id', membership.workspace_id)
    .eq('status', 'connected');

  async function connect() {
    'use server';
    await connectStubAccount(membership!.workspace_id);
  }

  return (
    <main>
      <h1>Connections</h1>
      <ul>
        {(accounts ?? []).map((account) => (
          <li key={account.id}>
            {account.provider}
            <VisibilitySelect
              accountId={account.id}
              visibility={account.visibility as 'private' | 'team' | 'company'}
            />
            <DisconnectButton accountId={account.id} />
          </li>
        ))}
      </ul>
      <form action={connect}>
        <button type="submit">Connect test account (stub)</button>
      </form>
    </main>
  );
}

function DisconnectButton({ accountId }: { accountId: string }) {
  async function onSubmit() {
    'use server';
    await disconnectAccount(accountId);
  }

  return (
    <form action={onSubmit}>
      <button type="submit">Disconnect</button>
    </form>
  );
}
