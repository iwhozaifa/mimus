import { createServiceClient } from '@/src/db/service';
import { logAgentRequest } from '@/src/server/agent/logAgentRequest';
import { describe, expect, it } from 'vitest';

describe('logAgentRequest', () => {
  const supabase = createServiceClient();

  it('writes a row and returns its id', async () => {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Log test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Log test ws' })
      .select('id')
      .single()
      .throwOnError();
    const { data: user } = await supabase.auth.admin.createUser({
      email: `log-${workspace!.id}@example.com`,
      email_confirm: true,
    });

    const id = await logAgentRequest({
      workspaceId: workspace!.id,
      userId: user!.user!.id,
      nature: 'lookup',
      priority: 'interactive',
      modelTier: 'fast',
      modelId: 'claude-haiku-4-5',
      inputTokens: 12,
      outputTokens: 34,
      costUsd: 0.002,
      sourceIds: { messages: ['abc'] },
      status: 'ok',
    });

    const { data: row } = await supabase
      .from('agent_logs')
      .select('nature, status')
      .eq('id', id)
      .single();

    expect(row?.nature).toBe('lookup');
    expect(row?.status).toBe('ok');
  });
});
