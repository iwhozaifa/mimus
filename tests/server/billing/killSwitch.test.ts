import { createServiceClient } from '@/src/db/service';
import { assertWorkspaceWritable, isWorkspaceReadOnly } from '@/src/server/billing/killSwitch';
import { describe, expect, it } from 'vitest';

describe('billing kill switch', () => {
  const supabase = createServiceClient();

  async function makeWorkspace() {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Kill switch test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Kill switch test ws' })
      .select('id')
      .single()
      .throwOnError();
    return { companyId: company!.id as string, workspaceId: workspace!.id as string };
  }

  it('a workspace with no subscription yet is writable (not lapsed)', async () => {
    const { workspaceId } = await makeWorkspace();
    await expect(isWorkspaceReadOnly(workspaceId)).resolves.toBe(false);
    await expect(assertWorkspaceWritable(workspaceId)).resolves.toBeUndefined();
  });

  it('an active subscription is writable', async () => {
    const { workspaceId } = await makeWorkspace();
    await supabase
      .from('workspace_subscriptions')
      .insert({ workspace_id: workspaceId, status: 'active' })
      .throwOnError();

    await expect(isWorkspaceReadOnly(workspaceId)).resolves.toBe(false);
  });

  it('a canceled or past_due subscription is read-only', async () => {
    const { workspaceId: canceledId } = await makeWorkspace();
    await supabase
      .from('workspace_subscriptions')
      .insert({ workspace_id: canceledId, status: 'canceled' })
      .throwOnError();
    await expect(isWorkspaceReadOnly(canceledId)).resolves.toBe(true);
    await expect(assertWorkspaceWritable(canceledId)).rejects.toThrow();

    const { workspaceId: pastDueId } = await makeWorkspace();
    await supabase
      .from('workspace_subscriptions')
      .insert({ workspace_id: pastDueId, status: 'past_due' })
      .throwOnError();
    await expect(isWorkspaceReadOnly(pastDueId)).resolves.toBe(true);
  });

  it("a lapsed workspace doesn't affect its company's other workspaces", async () => {
    const { companyId, workspaceId: lapsedId } = await makeWorkspace();
    await supabase
      .from('workspace_subscriptions')
      .insert({ workspace_id: lapsedId, status: 'canceled' })
      .throwOnError();

    const { data: otherWorkspace } = await supabase
      .from('workspaces')
      .insert({ company_id: companyId, name: 'Other ws' })
      .select('id')
      .single()
      .throwOnError();
    await supabase
      .from('workspace_subscriptions')
      .insert({ workspace_id: otherWorkspace!.id, status: 'active' })
      .throwOnError();

    await expect(isWorkspaceReadOnly(lapsedId)).resolves.toBe(true);
    await expect(isWorkspaceReadOnly(otherWorkspace!.id)).resolves.toBe(false);
  });
});
