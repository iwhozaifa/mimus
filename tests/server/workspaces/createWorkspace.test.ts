import { createServiceClient } from '@/src/db/service';
import { createWorkspaceForNewUser } from '@/src/server/workspaces/createWorkspace';
import { afterAll, describe, expect, it } from 'vitest';

describe('createWorkspaceForNewUser', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    const supabase = createServiceClient();
    for (const id of createdUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
  });

  it('gives a new user exactly one owned workspace', async () => {
    const supabase = createServiceClient();
    const email = `signup-${Date.now()}@example.com`;
    const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) throw error;
    createdUserIds.push(data.user.id);

    await createWorkspaceForNewUser(data.user.id, email);

    const { data: memberships } = await supabase
      .from('workspace_members')
      .select('role, workspace_id')
      .eq('user_id', data.user.id);

    expect(memberships).toHaveLength(1);
    expect(memberships?.[0].role).toBe('owner');

    // Calling it again (e.g. a second login) must not create a second workspace.
    await createWorkspaceForNewUser(data.user.id, email);

    const { data: membershipsAfterSecondCall } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', data.user.id);

    expect(membershipsAfterSecondCall).toHaveLength(1);
    expect(membershipsAfterSecondCall?.[0].workspace_id).toBe(memberships?.[0].workspace_id);
  });
});
