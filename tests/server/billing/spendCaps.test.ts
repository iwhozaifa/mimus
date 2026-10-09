import { createServiceClient } from '@/src/db/service';
import {
  capTier,
  getMonthlySpend,
  recordAgentSpend,
  resolveSpendCappedTier,
} from '@/src/server/billing/spendCaps';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('capTier (the 80%-of-cap tier-drop rule)', () => {
  it('leaves the tier alone with no cap or under 80% of it', () => {
    expect(capTier('deep', { capUsd: null, spentUsd: 1_000 })).toBe('deep');
    expect(capTier('deep', { capUsd: 100, spentUsd: 79.99 })).toBe('deep');
  });

  it('drops one tier at 80% of the cap', () => {
    expect(capTier('deep', { capUsd: 100, spentUsd: 80 })).toBe('standard');
    expect(capTier('standard', { capUsd: 100, spentUsd: 95 })).toBe('fast');
    expect(capTier('fast', { capUsd: 100, spentUsd: 95 })).toBe('fast');
  });

  it('blocks at 100% of the cap', () => {
    expect(capTier('fast', { capUsd: 100, spentUsd: 100 })).toBeNull();
  });
});

describe('spend counters (real local Supabase)', () => {
  const supabase = createServiceClient();
  let companyId: string;
  let workspaceId: string;
  let planId: string;

  beforeAll(async () => {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Spend test co' })
      .select('id')
      .single()
      .throwOnError();
    companyId = company!.id;
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: companyId, name: 'Spend test ws' })
      .select('id')
      .single()
      .throwOnError();
    workspaceId = workspace!.id;
    const { data: plan } = await supabase
      .from('plans')
      .insert({ name: 'Spend test plan', ai_spend_cap_usd: 10 })
      .select('id')
      .single()
      .throwOnError();
    planId = plan!.id;
    await supabase
      .from('workspace_subscriptions')
      .insert({ workspace_id: workspaceId, plan_id: planId, status: 'active' })
      .throwOnError();
  });

  afterAll(async () => {
    await supabase.from('companies').delete().eq('id', companyId);
    await supabase.from('plans').delete().eq('id', planId);
  });

  it('accumulates spend per day and sums the current UTC month against the plan cap', async () => {
    const now = new Date('2026-10-09T12:00:00Z');
    await recordAgentSpend(workspaceId, 3, now);
    await recordAgentSpend(workspaceId, 2.5, now);
    await recordAgentSpend(workspaceId, 1, new Date('2026-10-01T00:00:00Z'));
    // Last month's spend doesn't count toward this month's cap.
    await recordAgentSpend(workspaceId, 50, new Date('2026-09-30T23:59:59Z'));

    await expect(getMonthlySpend(workspaceId, now)).resolves.toEqual({
      capUsd: 10,
      spentUsd: 6.5,
    });
  });

  it('applies the tier drop from the live counters', async () => {
    const now = new Date('2026-10-20T12:00:00Z');
    // 6.5 already spent this month; +2 = 8.5 = 85% of the $10 cap.
    await recordAgentSpend(workspaceId, 2, now);

    await expect(resolveSpendCappedTier(workspaceId, 'deep', now)).resolves.toBe('standard');
  });

  it('treats a workspace with no plan as uncapped', async () => {
    const { data: other } = await supabase
      .from('workspaces')
      .insert({ company_id: companyId, name: 'No plan ws' })
      .select('id')
      .single()
      .throwOnError();

    await expect(getMonthlySpend(other!.id)).resolves.toEqual({ capUsd: null, spentUsd: 0 });
    await expect(resolveSpendCappedTier(other!.id, 'deep')).resolves.toBe('deep');
  });
});
