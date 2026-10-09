import { createClient } from '@/src/db/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cache } from 'react';

export type WorkspaceContext = {
  supabase: SupabaseClient;
  userId: string;
  email: string;
  fullName: string | null;
  workspaceId: string;
  workspaceName: string;
  role: 'owner' | 'manager' | 'member';
};

// Memoized per request: the (app) layout's nav and read-only banner and the
// page itself all need this, and without cache() each one re-ran the auth
// check and both queries.
export const getCurrentWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> =>
  loadWorkspaceContext(await createClient()),
);

export async function loadWorkspaceContext(
  supabase: SupabaseClient,
): Promise<WorkspaceContext | null> {
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub as string | undefined;
  const email = claims?.claims.email as string | undefined;

  if (!userId || !email) {
    return null;
  }

  // Independent lookups -- run them concurrently rather than back to back.
  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from('workspace_members')
      .select('workspace_id, role, workspaces(name)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle<{
        workspace_id: string;
        role: 'owner' | 'manager' | 'member';
        workspaces: { name: string } | null;
      }>(),
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle<{ full_name: string | null }>(),
  ]);

  if (!membership) {
    return null;
  }

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
