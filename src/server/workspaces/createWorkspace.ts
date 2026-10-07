import { createServiceClient } from '@/src/db/service';

// Idempotent: a repeat call for a user who already has a workspace (e.g. a
// second login) returns without creating a duplicate -- enforced by the
// underlying SQL function, not by this wrapper.
export async function createWorkspaceForNewUser(userId: string, email: string): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('create_default_workspace_for_user', {
    p_user_id: userId,
    p_email: email,
  });

  if (error) {
    throw error;
  }

  return data as string;
}
