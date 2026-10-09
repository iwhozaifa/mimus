import { createServiceClient } from '@/src/db/service';
import type { ModelTier } from '@/src/server/agent/providers/types';
import { tierDown } from '@/src/server/agent/router/tiers';

export interface MonthlySpend {
  // null = the workspace's plan sets no cap (or it has no plan yet).
  capUsd: number | null;
  spentUsd: number;
}

const TIER_DROP_AT = 0.8;

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcMonthStart(date: Date): string {
  return `${date.toISOString().slice(0, 7)}-01`;
}

// At 80% of the monthly cap every request drops one tier; at 100% the
// workspace is blocked (null) until the next month or a higher cap.
export function capTier(tier: ModelTier, { capUsd, spentUsd }: MonthlySpend): ModelTier | null {
  if (capUsd === null) return tier;
  if (spentUsd >= capUsd) return null;
  if (spentUsd >= capUsd * TIER_DROP_AT) return tierDown(tier);
  return tier;
}

export async function recordAgentSpend(
  workspaceId: string,
  costUsd: number,
  now: Date = new Date(),
): Promise<void> {
  const { error } = await createServiceClient().rpc('record_agent_spend', {
    p_workspace_id: workspaceId,
    p_day: utcDay(now),
    p_cost_usd: costUsd,
  });
  if (error) throw error;
}

export async function getMonthlySpend(
  workspaceId: string,
  now: Date = new Date(),
): Promise<MonthlySpend> {
  const supabase = createServiceClient();
  const [{ data: subscription, error: subscriptionError }, { data: days, error: daysError }] =
    await Promise.all([
      supabase
        .from('workspace_subscriptions')
        .select('plans(ai_spend_cap_usd)')
        .eq('workspace_id', workspaceId)
        .maybeSingle<{ plans: { ai_spend_cap_usd: number | string | null } | null }>(),
      supabase
        .from('agent_spend_counters')
        .select('cost_usd')
        .eq('workspace_id', workspaceId)
        .gte('day', utcMonthStart(now))
        .lte('day', utcDay(now)),
    ]);
  if (subscriptionError) throw subscriptionError;
  if (daysError) throw daysError;

  const cap = subscription?.plans?.ai_spend_cap_usd;
  return {
    capUsd: cap === null || cap === undefined ? null : Number(cap),
    spentUsd: (days ?? []).reduce((sum, row) => sum + Number(row.cost_usd), 0),
  };
}

export async function resolveSpendCappedTier(
  workspaceId: string,
  tier: ModelTier,
  now: Date = new Date(),
): Promise<ModelTier | null> {
  return capTier(tier, await getMonthlySpend(workspaceId, now));
}
