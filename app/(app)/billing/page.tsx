import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SubscribeButton } from './subscribe-button';

export default function BillingPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
      <BillingContent />
    </Suspense>
  );
}

async function BillingContent() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return (
      <Card>
        <Link
          href="/sign-in?next=/billing"
          className="font-medium text-accent-strong hover:text-accent"
        >
          Sign in
        </Link>
      </Card>
    );
  }

  const { supabase, workspaceId, role } = context;

  const { data: plans } = await supabase
    .from('plans')
    .select('id, name, ai_spend_cap_usd, seat_limit');

  const { data: subscription } = await supabase
    .from('workspace_subscriptions')
    .select('plan_id, status, current_period_end, plans(name, feature_defaults)')
    .eq('workspace_id', workspaceId)
    .maybeSingle<{
      plan_id: string;
      status: string;
      current_period_end: string | null;
      plans: { name: string; feature_defaults: Record<string, boolean> } | null;
    }>();

  return (
    <Card>
      <h1 className="mb-4 text-2xl font-semibold text-ink">Billing</h1>

      {(plans ?? []).length === 0 && (
        <p className="text-sm text-ink-muted">No plans configured yet.</p>
      )}

      <ul className="flex flex-col gap-3">
        {(plans ?? []).map((plan) => {
          const current = subscription?.plan_id === plan.id ? subscription : null;
          const isCurrent = current !== null;
          return (
            <li
              key={plan.id}
              className="flex items-center justify-between gap-4 rounded-md border border-line-muted p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{plan.name}</span>
                  {current && <Badge variant="accent-soft">{current.status}</Badge>}
                </div>
                {current?.current_period_end && (
                  <p className="mt-1 text-xs text-ink-faint">
                    Renews {new Date(current.current_period_end).toLocaleDateString()}
                  </p>
                )}
              </div>
              {!isCurrent && role === 'owner' && <SubscribeButton planId={plan.id} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
