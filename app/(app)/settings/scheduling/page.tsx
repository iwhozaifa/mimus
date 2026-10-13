import { connectionLabel } from '@/src/server/connectors/labels';
import type { AccountType, Provider } from '@/src/server/connectors/types';
import { loadApprovalLevel, loadSchedulingRules } from '@/src/server/scheduling/rules';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { SchedulingForm } from './scheduling-form';

export default function SchedulingSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Scheduling</h1>
        <p className="mt-1 text-sm text-ink-muted">
          How Mimus answers people who want to meet you. These settings are yours alone. To send and
          book from Mimus, also allow sending and booking for an account on the{' '}
          <Link href="/settings/connections" className="underline underline-offset-2">
            Connections
          </Link>{' '}
          page.
        </p>
      </div>
      <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
        <SchedulingSettings />
      </Suspense>
    </div>
  );
}

async function SchedulingSettings() {
  await connection();
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return (
      <Card>
        <Link href="/sign-in?next=/settings/scheduling" className="font-medium text-accent-strong">
          Sign in
        </Link>
      </Card>
    );
  }
  const { supabase, workspaceId, userId } = context;

  const [rules, level, { data: accounts }] = await Promise.all([
    loadSchedulingRules(supabase, workspaceId, userId),
    loadApprovalLevel(supabase, workspaceId, userId),
    supabase
      .from('connected_accounts')
      .select('id, provider, account_type, external_account_id')
      .eq('workspace_id', workspaceId)
      .eq('owner_user_id', userId)
      .eq('status', 'connected')
      .in('account_type', ['calendar', 'scheduling']),
  ]);
  const own = (accounts ?? []) as Array<{
    id: string;
    provider: Provider;
    account_type: AccountType;
    external_account_id: string | null;
  }>;

  return (
    <Card>
      <SchedulingForm
        initial={{ ...rules, level }}
        calendars={own
          .filter((account) => account.account_type === 'calendar')
          .map((account) => ({
            id: account.id,
            label: `${connectionLabel(account.provider, account.account_type)} · ${account.external_account_id ?? ''}`,
          }))}
        hasCalendly={own.some((account) => account.provider === 'calendly')}
      />
    </Card>
  );
}
