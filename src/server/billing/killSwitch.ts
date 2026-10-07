import { createServiceClient } from '@/src/db/service';

const READ_ONLY_STATUSES = new Set(['past_due', 'canceled']);

// No subscription row yet (the common case until a workspace actually
// checks out) is treated as writable, not lapsed -- only an existing,
// lapsed subscription locks a workspace. Scoped to one workspace: a
// canceled workspace never affects its company's other workspaces.
export async function isWorkspaceReadOnly(workspaceId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('workspace_subscriptions')
    .select('status')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!data) {
    return false;
  }
  return READ_ONLY_STATUSES.has(data.status);
}

export async function assertWorkspaceWritable(workspaceId: string): Promise<void> {
  if (await isWorkspaceReadOnly(workspaceId)) {
    throw new Error('This workspace is read-only (billing is past due or canceled)');
  }
}
