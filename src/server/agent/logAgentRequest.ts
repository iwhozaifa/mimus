import { createServiceClient } from '@/src/db/service';

export async function logAgentRequest(params: {
  workspaceId: string;
  userId: string;
  nature: string;
  priority: string;
  modelTier: 'fast' | 'standard' | 'deep';
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  sourceIds: Record<string, unknown>;
  status: string;
}): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('log_agent_request', {
    p_workspace_id: params.workspaceId,
    p_user_id: params.userId,
    p_nature: params.nature,
    p_priority: params.priority,
    p_model_tier: params.modelTier,
    p_model_id: params.modelId,
    p_input_tokens: params.inputTokens,
    p_output_tokens: params.outputTokens,
    p_cost_usd: params.costUsd,
    p_source_ids: params.sourceIds,
    p_status: params.status,
  });
  if (error) throw error;
  return data as string;
}
