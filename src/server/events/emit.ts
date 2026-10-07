import { createServiceClient } from '@/src/db/service';

export async function emitSignal(
  workspaceId: string,
  type: string,
  payload: Record<string, unknown>,
  sourceConnectedAccountId?: string,
): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('event_signals')
    .insert({
      workspace_id: workspaceId,
      type,
      payload,
      source_connected_account_id: sourceConnectedAccountId ?? null,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}
