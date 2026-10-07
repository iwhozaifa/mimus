import { createServiceClient } from '@/src/db/service';
import { assertWorkspaceWritable } from '@/src/server/billing/killSwitch';
import { canInviteWithRole, type WorkspaceRole } from '@/src/server/permissions/roles';
import { sendInviteEmail } from '@/src/server/email/sendInviteEmail';
import { randomUUID } from 'node:crypto';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createInvite(params: {
  workspaceId: string;
  workspaceName: string;
  invitedByUserId: string;
  email: string;
  role: WorkspaceRole;
  baseUrl: string;
}) {
  const allowed = await canInviteWithRole(params.invitedByUserId, params.workspaceId, params.role);
  if (!allowed) {
    throw new Error('Not allowed to invite at this role');
  }
  await assertWorkspaceWritable(params.workspaceId);

  const supabase = createServiceClient();
  const { data: inviter } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', params.workspaceId)
    .eq('user_id', params.invitedByUserId)
    .single();

  const token = randomUUID();
  const { data: invite, error } = await supabase
    .from('invites')
    .insert({
      workspace_id: params.workspaceId,
      email: params.email,
      role: params.role,
      invited_by: inviter?.id ?? null,
      token,
      status: 'pending',
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  await sendInviteEmail({
    to: params.email,
    workspaceName: params.workspaceName,
    inviteUrl: `${params.baseUrl}/invite/${token}`,
  });

  return invite;
}
