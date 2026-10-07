import { createServiceClient } from '@/src/db/service';
import { assertFeatureEnabled, isFeatureEnabled } from '@/src/server/permissions/featureSwitches';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('feature switches', () => {
  const supabase = createServiceClient();

  async function makeWorkspace() {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'FS test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'FS test ws' })
      .select('id')
      .single()
      .throwOnError();
    return workspace!.id as string;
  }

  it('defaults Money/Pipeline/Projects/Canopy to off with no plan assigned', async () => {
    const workspaceId = await makeWorkspace();

    for (const key of ['money', 'pipeline', 'projects', 'canopy']) {
      await expect(isFeatureEnabled(workspaceId, key)).resolves.toBe(false);
    }
  });

  it("a plan's feature_defaults can turn a switch on", async () => {
    const workspaceId = await makeWorkspace();

    const { data: plan } = await supabase
      .from('plans')
      .insert({ name: `Plan ${randomUUID()}`, feature_defaults: { money: true } })
      .select('id')
      .single()
      .throwOnError();
    await supabase
      .from('workspace_subscriptions')
      .insert({ workspace_id: workspaceId, plan_id: plan!.id, status: 'active' })
      .throwOnError();

    await expect(isFeatureEnabled(workspaceId, 'money')).resolves.toBe(true);
  });

  it('a per-workspace override wins over the plan default', async () => {
    const workspaceId = await makeWorkspace();

    const { data: plan } = await supabase
      .from('plans')
      .insert({ name: `Plan ${randomUUID()}`, feature_defaults: { money: true } })
      .select('id')
      .single()
      .throwOnError();
    await supabase
      .from('workspace_subscriptions')
      .insert({ workspace_id: workspaceId, plan_id: plan!.id, status: 'active' })
      .throwOnError();
    await supabase
      .from('feature_switches')
      .insert({ workspace_id: workspaceId, key: 'money', enabled: false })
      .throwOnError();

    await expect(isFeatureEnabled(workspaceId, 'money')).resolves.toBe(false);
  });

  it('assertFeatureEnabled throws when a feature is off and resolves when on', async () => {
    const workspaceId = await makeWorkspace();

    await expect(assertFeatureEnabled(workspaceId, 'money')).rejects.toThrow();

    await supabase
      .from('feature_switches')
      .insert({ workspace_id: workspaceId, key: 'money', enabled: true })
      .throwOnError();

    await expect(assertFeatureEnabled(workspaceId, 'money')).resolves.toBeUndefined();
  });
});
