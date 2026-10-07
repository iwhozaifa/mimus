import { isFeatureEnabled } from '@/src/server/permissions/featureSwitches';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { ToggleSwitch } from './toggle-switch';

const HARDCODED_KEYS = ['money', 'pipeline', 'projects', 'canopy'];

function labelFor(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function FeatureSwitchesPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
      <FeatureSwitchesContent />
    </Suspense>
  );
}

async function FeatureSwitchesContent() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/sign-in?next=/feature-switches"
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const { supabase, workspaceId, role } = context;

  if (role !== 'owner') {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold text-slate-900">Feature switches</h1>
        <p className="text-sm text-slate-500">Only workspace owners can manage feature switches.</p>
      </div>
    );
  }

  const { data: overrides } = await supabase
    .from('feature_switches')
    .select('key')
    .eq('workspace_id', workspaceId);

  const { data: subscription } = await supabase
    .from('workspace_subscriptions')
    .select('plans(feature_defaults)')
    .eq('workspace_id', workspaceId)
    .maybeSingle<{ plans: { feature_defaults: Record<string, boolean> } | null }>();

  const planKeys = Object.keys(subscription?.plans?.feature_defaults ?? {});
  const overrideKeys = (overrides ?? []).map((row) => row.key as string);

  const keys = Array.from(new Set([...HARDCODED_KEYS, ...overrideKeys, ...planKeys])).sort();

  const switches = await Promise.all(
    keys.map(async (key) => ({ key, enabled: await isFeatureEnabled(workspaceId, key) })),
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Feature switches</h1>
      <p className="mb-4 text-sm text-slate-500">
        Admin configuration only — none of these have a product page in this app yet.
      </p>
      <ul className="flex flex-col gap-3">
        {switches.map(({ key, enabled }) => (
          <li
            key={key}
            className="flex items-center justify-between gap-4 rounded-md border border-slate-200 p-3"
          >
            <span className="font-medium text-slate-800">{labelFor(key)}</span>
            <ToggleSwitch label={labelFor(key)} feKey={key} enabled={enabled} />
          </li>
        ))}
      </ul>
    </div>
  );
}
