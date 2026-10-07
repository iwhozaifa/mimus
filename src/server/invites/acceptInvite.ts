import { createServiceClient } from '@/src/db/service';

export async function acceptInvite(params: { token: string; userId: string }): Promise<void> {
  const supabase = createServiceClient();
  const { data: invite, error } = await supabase
    .from('invites')
    .select('id, workspace_id, role, status, expires_at')
    .eq('token', params.token)
    .single();

  if (error || !invite) {
    throw new Error('Invite not found');
  }
  if (invite.status !== 'pending') {
    throw new Error('Invite is no longer pending');
  }
  if (new Date(invite.expires_at) <= new Date()) {
    throw new Error('Invite has expired');
  }

  const { error: memberError } = await supabase.from('workspace_members').insert({
    workspace_id: invite.workspace_id,
    user_id: params.userId,
    role: invite.role,
  });
  if (memberError) throw memberError;

  const { error: updateError } = await supabase
    .from('invites')
    .update({ status: 'accepted' })
    .eq('id', invite.id);
  if (updateError) throw updateError;
}
