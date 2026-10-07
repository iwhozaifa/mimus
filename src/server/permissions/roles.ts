import { createServiceClient } from '@/src/db/service';

// Thin wrappers around the SQL functions that are the actual source of
// truth -- every decision here is one RPC call, so the TS and SQL layers
// can never diverge. Internal only: the underlying functions are revoked
// from anon/authenticated, so only server-side code (via the service
// client) can call them.

export async function getWorkspaceRole(
  userId: string,
  workspaceId: string,
): Promise<'owner' | 'manager' | 'member' | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('get_workspace_role', {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  });
  if (error) throw error;
  return data;
}

export type WorkspaceRole = 'owner' | 'manager' | 'member';

// Owner can invite at any role. Manager can only invite Members -- the same
// scope they're allowed to manage once invited (see canManageMember).
export async function canInviteWithRole(
  actingUserId: string,
  workspaceId: string,
  role: WorkspaceRole,
): Promise<boolean> {
  const actingRole = await getWorkspaceRole(actingUserId, workspaceId);
  if (actingRole === 'owner') return true;
  if (actingRole === 'manager') return role === 'member';
  return false;
}

export async function canManageMember(
  actingUserId: string,
  targetMembershipId: string,
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('can_manage_member', {
    p_actor_user_id: actingUserId,
    p_target_membership_id: targetMembershipId,
  });
  if (error) throw error;
  return data;
}
