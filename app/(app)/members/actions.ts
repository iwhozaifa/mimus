'use server';

import { assertWorkspaceWritable } from '@/src/server/billing/killSwitch';
import { createInvite } from '@/src/server/invites/createInvite';
import { getBaseUrl } from '@/src/server/http/getBaseUrl';
import type { WorkspaceRole } from '@/src/server/permissions/roles';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { revalidatePath } from 'next/cache';

export async function inviteMember(email: string, role: WorkspaceRole) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    throw new Error('Not signed in');
  }

  const baseUrl = await getBaseUrl();
  await createInvite({
    workspaceId: context.workspaceId,
    workspaceName: context.workspaceName,
    invitedByUserId: context.userId,
    email,
    role,
    baseUrl,
  });
  revalidatePath('/members');
}

// Enforcement is migration 0011's RLS UPDATE policy on workspace_members,
// not this function -- a disallowed change simply affects 0 rows (no error),
// since this runs under the caller's own session client.
export async function changeMemberRole(memberId: string, newRole: WorkspaceRole) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    throw new Error('Not signed in');
  }
  await assertWorkspaceWritable(context.workspaceId);

  const { error } = await context.supabase
    .from('workspace_members')
    .update({ role: newRole })
    .eq('id', memberId);
  if (error) throw error;
  revalidatePath('/members');
}

export async function removeMember(memberId: string) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    throw new Error('Not signed in');
  }
  await assertWorkspaceWritable(context.workspaceId);

  const { error } = await context.supabase
    .from('workspace_members')
    .update({ status: 'removed' })
    .eq('id', memberId);
  if (error) throw error;
  revalidatePath('/members');
}
