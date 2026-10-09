import { isGoogleConfigured } from '@/src/server/connectors/bootstrap';
import { connectionLabel } from '@/src/server/connectors/labels';
import type { AccountType, Provider } from '@/src/server/connectors/types';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { disconnectAccount } from './actions';
import { VisibilitySelect } from './visibility-select';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

interface AccountRow {
  id: string;
  provider: Provider;
  account_type: AccountType;
  external_account_id: string | null;
  visibility: 'private' | 'team' | 'company';
  status: 'connected' | 'needs_reauth';
}

const ERROR_MESSAGES: Record<string, string> = {
  google_denied: 'Google connection was cancelled.',
  google_invalid_state: 'That Google sign-in expired or came from another session. Try again.',
  google_connect_failed: "Couldn't finish connecting Google. Try again.",
  google_not_configured: "Google connection isn't set up on this deployment yet.",
};

const linkButton =
  'inline-flex rounded-md bg-ink px-4 py-2 text-sm font-medium text-ink-foreground transition-colors hover:bg-ink/90';

export default function ConnectionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
      <ConnectionsList searchParams={searchParams} />
    </Suspense>
  );
}

async function ConnectionsList({ searchParams }: { searchParams: SearchParams }) {
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
  const { error: errorParam } = await searchParams;
  const errorCode = typeof errorParam === 'string' ? errorParam : null;

  const { data } = await supabase
    .from('connected_accounts')
    .select('id, provider, account_type, external_account_id, visibility, status')
    .eq('workspace_id', workspaceId)
    .in('status', ['connected', 'needs_reauth'])
    .order('created_at');
  const accounts = (data ?? []) as AccountRow[];

  const googleAccounts = accounts.filter((account) => account.provider === 'google');
  const otherAccounts = accounts.filter((account) => account.provider !== 'google');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Connections</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Connect the accounts Mimus reads from. Access is read-only, and each connection has its
          own visibility.
        </p>
      </div>

      {errorCode && (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {ERROR_MESSAGES[errorCode] ?? "Couldn't connect that account. Try again."}
        </p>
      )}

      <GoogleCard accounts={googleAccounts} configured={isGoogleConfigured()} />

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-ink">Other connectors</h2>
        {otherAccounts.length > 0 && (
          <ul className="mb-6 flex flex-col divide-y divide-line-muted">
            {otherAccounts.map((account) => (
              <AccountItem key={account.id} account={account} showIdentifier />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href="/api/connectors/microsoft/start" className={linkButton}>
            Connect Microsoft
          </Link>
          <Link href="/api/connectors/slack/start" className={linkButton}>
            Connect Slack
          </Link>
          <Link href="/api/connectors/calendly/start" className={linkButton}>
            Connect Calendly
          </Link>
        </div>
      </Card>
    </div>
  );
}

// One Google grant connects both Gmail and Calendar for one address, so
// accounts are grouped by address, each listing its two rows.
function GoogleCard({ accounts, configured }: { accounts: AccountRow[]; configured: boolean }) {
  const byAddress = new Map<string, AccountRow[]>();
  for (const account of accounts) {
    const address = account.external_account_id ?? 'Google account';
    byAddress.set(address, [...(byAddress.get(address) ?? []), account]);
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-ink">Gmail &amp; Google Calendar</h2>
      <p className="mt-1 mb-4 text-sm text-ink-muted">
        Connect a Google account to give Mimus read-only access to its inbox and calendar. You can
        connect more than one.
      </p>

      {byAddress.size > 0 && (
        <div className="mb-6 flex flex-col gap-4">
          {[...byAddress].map(([address, rows]) => (
            <div
              key={address}
              role="group"
              aria-label={address}
              className="rounded-md border border-line-muted p-4"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium break-all text-ink">{address}</span>
                {rows.some((row) => row.status === 'needs_reauth') && configured && (
                  <Link
                    href="/api/connectors/google/start"
                    className="text-sm font-medium text-accent-strong hover:text-accent"
                  >
                    Reconnect
                  </Link>
                )}
              </div>
              <ul className="flex flex-col divide-y divide-line-muted">
                {rows.map((account) => (
                  <AccountItem key={account.id} account={account} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {configured ? (
        <Link href="/api/connectors/google/start" className={linkButton}>
          {byAddress.size > 0 ? 'Add another Google account' : 'Connect Google account'}
        </Link>
      ) : (
        <p className="text-sm text-ink-muted">
          Google connection isn&apos;t set up on this deployment yet. The operator needs to set the
          GOOGLE_OAUTH_* environment variables.
        </p>
      )}
    </Card>
  );
}

function AccountItem({
  account,
  showIdentifier = false,
}: {
  account: AccountRow;
  showIdentifier?: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2 font-medium text-ink">
          {connectionLabel(account.provider, account.account_type)}
          {account.status === 'needs_reauth' && (
            <Badge variant="danger-soft">Needs reconnect</Badge>
          )}
        </span>
        {showIdentifier && account.external_account_id && (
          <span className="text-sm break-all text-ink-muted">{account.external_account_id}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <VisibilitySelect accountId={account.id} visibility={account.visibility} />
        <DisconnectButton accountId={account.id} />
      </div>
    </li>
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
