import { isFeatureEnabled } from '@/src/server/permissions/featureSwitches';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { ToggleSwitch } from './toggle-switch';

const HARDCODED_KEYS = ['money', 'pipeline', 'projects', 'canopy'];

function labelFor(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function FeatureSwitchesPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
      <FeatureSwitchesContent />
    </Suspense>
  );
}

async function FeatureSwitchesContent() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return (
      <Card>
        <Link
          href="/sign-in?next=/feature-switches"
          className="font-medium text-accent-strong hover:text-accent"
        >
          Sign in
        </Link>
      </Card>
    );
  }

  const { supabase, workspaceId, role } = context;

  if (role !== 'owner') {
    return (
      <Card>
        <h1 className="mb-2 text-2xl font-semibold text-ink">Feature switches</h1>
        <p className="text-sm text-ink-muted">Only workspace owners can manage feature switches.</p>
      </Card>
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
    <Card>
      <h1 className="mb-1 text-2xl font-semibold text-ink">Feature switches</h1>
      <p className="mb-4 text-sm text-ink-muted">
        Admin configuration only — none of these have a product page in this app yet.
      </p>
      <ul className="flex flex-col divide-y divide-line-muted">
        {switches.map(({ key, enabled }) => (
          <li
            key={key}
            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <span className="font-medium text-ink">{labelFor(key)}</span>
            <ToggleSwitch label={labelFor(key)} feKey={key} enabled={enabled} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
