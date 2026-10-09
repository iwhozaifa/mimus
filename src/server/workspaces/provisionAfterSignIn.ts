import { createServiceClient } from '@/src/db/service';
import { createWorkspaceForNewUser } from '@/src/server/workspaces/createWorkspace';

const INVITE_PATH = /^\/invite\/([^/?#]+)$/;

export function inviteTokenFromPath(next: string): string | null {
  return INVITE_PATH.exec(next)?.[1] ?? null;
}

async function isAcceptableInvite(token: string): Promise<boolean> {
  const { data } = await createServiceClient()
    .from('invites')
    .select('status, expires_at')
    .eq('token', token)
    .maybeSingle();
  return data?.status === 'pending' && new Date(data.expires_at) > new Date();
}

// A user signing in to accept an invite joins the inviter's workspace, so
// auto-creating an owner workspace for them first would leave them in two.
// Any token acceptInvite would reject falls through to normal provisioning,
// so nobody ends up without a workspace.
export async function provisionAfterSignIn({
  userId,
  email,
  next,
}: {
  userId: string;
  email: string;
  next: string;
}): Promise<'provisioned' | 'skipped_for_invite'> {
  const token = inviteTokenFromPath(next);
  if (token && (await isAcceptableInvite(token))) {
    // Still create the profile (create_default_workspace_for_user normally
    // does): the invited workspace's members page reads emails from it.
    const { error } = await createServiceClient()
      .from('profiles')
      .upsert({ id: userId, email }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
    return 'skipped_for_invite';
  }

  await createWorkspaceForNewUser(userId, email);
  return 'provisioned';
}
