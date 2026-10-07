import { createServiceClient } from '@/src/db/service';

// Money/Pipeline/Projects/Canopy don't exist yet, so they stay off even for
// a workspace with no plan assigned. Anything else defaults on until a plan
// says otherwise.
const HARDCODED_DEFAULTS: Record<string, boolean> = {
  money: false,
  pipeline: false,
  projects: false,
  canopy: false,
};

export async function isFeatureEnabled(workspaceId: string, key: string): Promise<boolean> {
  const supabase = createServiceClient();

  const { data: override } = await supabase
    .from('feature_switches')
    .select('enabled')
    .eq('workspace_id', workspaceId)
    .eq('key', key)
    .maybeSingle();
  if (override) {
    return override.enabled;
  }

  const { data: subscription } = await supabase
    .from('workspace_subscriptions')
    .select('plans(feature_defaults)')
    .eq('workspace_id', workspaceId)
    .maybeSingle<{ plans: { feature_defaults: Record<string, boolean> } | null }>();
  const defaults = subscription?.plans?.feature_defaults;
  if (defaults && key in defaults) {
    return defaults[key];
  }

  return HARDCODED_DEFAULTS[key] ?? true;
}

export async function assertFeatureEnabled(workspaceId: string, key: string): Promise<void> {
  const enabled = await isFeatureEnabled(workspaceId, key);
  if (!enabled) {
    throw new Error(`Feature "${key}" is not enabled for this workspace`);
  }
}
