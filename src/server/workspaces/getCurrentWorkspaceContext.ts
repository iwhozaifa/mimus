import { createClient } from '@/src/db/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkspaceContext = {
  supabase: SupabaseClient;
  userId: string;
  email: string;
  fullName: string | null;
  workspaceId: string;
  workspaceName: string;
  role: 'owner' | 'manager' | 'member';
};

export async function getCurrentWorkspaceContext(): Promise<WorkspaceContext | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub as string | undefined;
  const email = claims?.claims.email as string | undefined;

  if (!userId || !email) {
    return null;
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle<{
      workspace_id: string;
      role: 'owner' | 'manager' | 'member';
      workspaces: { name: string } | null;
    }>();

  if (!membership) {
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle<{ full_name: string | null }>();

  return {
    supabase,
    userId,
    email,
    fullName: profile?.full_name ?? null,
    workspaceId: membership.workspace_id,
    workspaceName: membership.workspaces?.name ?? '',
    role: membership.role,
  };
}
