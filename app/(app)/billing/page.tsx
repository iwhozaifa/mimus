import { isWorkspaceReadOnly } from '@/src/server/billing/killSwitch';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { ReadOnlyBanner } from '../read-only-banner';
import { SubscribeButton } from './subscribe-button';

export default function BillingPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
      <BillingContent />
    </Suspense>
  );
}

async function BillingContent() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/sign-in?next=/billing"
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          Sign in
        </Link>
      </div>
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

  const readOnly = await isWorkspaceReadOnly(workspaceId);

  return (
    <div>
      <ReadOnlyBanner isReadOnly={readOnly} />
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">Billing</h1>

        {(plans ?? []).length === 0 && (
          <p className="text-sm text-slate-500">No plans configured yet.</p>
        )}

        <ul className="flex flex-col gap-3">
          {(plans ?? []).map((plan) => {
            const current = subscription?.plan_id === plan.id ? subscription : null;
            const isCurrent = current !== null;
            return (
              <li
                key={plan.id}
                className="flex items-center justify-between gap-4 rounded-md border border-slate-200 p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{plan.name}</span>
                    {current && (
                      <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium capitalize text-emerald-700">
                        {current.status}
                      </span>
                    )}
                  </div>
                  {current?.current_period_end && (
                    <p className="mt-1 text-xs text-slate-500">
                      Renews {new Date(current.current_period_end).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {!isCurrent && role === 'owner' && <SubscribeButton planId={plan.id} />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
