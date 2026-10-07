import { createServiceClient } from '@/src/db/service';
import { canManageMember, getWorkspaceRole } from '@/src/server/permissions/roles';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('permission engine: roles', () => {
  const supabase = createServiceClient();
  const ownerId = randomUUID();
  const managerId = randomUUID();
  const memberId = randomUUID();
  let workspaceId: string;
  let managerMembershipId: string;
  let memberMembershipId: string;

  beforeAll(async () => {
    for (const [id, email] of [
      [ownerId, 'owner'],
      [managerId, 'manager'],
      [memberId, 'member'],
    ] as const) {
      const { error } = await supabase.auth.admin.createUser({
        id,
        email: `${email}-${id}@example.com`,
        email_confirm: true,
      });
      if (error) throw error;
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({ name: 'Roles test co' })
      .select('id')
      .single();
    if (companyError) throw companyError;

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({ company_id: company.id, name: 'Roles test ws' })
      .select('id')
      .single();
    if (workspaceError) throw workspaceError;
    workspaceId = workspace.id;

    const { data: members, error: membersError } = await supabase
      .from('workspace_members')
      .insert([
        { workspace_id: workspaceId, user_id: ownerId, role: 'owner' },
        { workspace_id: workspaceId, user_id: managerId, role: 'manager' },
        { workspace_id: workspaceId, user_id: memberId, role: 'member' },
      ])
      .select('id, role');
    if (membersError) throw membersError;

    managerMembershipId = members.find((m) => m.role === 'manager')!.id;
    memberMembershipId = members.find((m) => m.role === 'member')!.id;
  });

  afterAll(async () => {
    for (const id of [ownerId, managerId, memberId]) {
      await supabase.auth.admin.deleteUser(id);
    }
  });

  it("resolves each member's role", async () => {
    await expect(getWorkspaceRole(ownerId, workspaceId)).resolves.toBe('owner');
    await expect(getWorkspaceRole(managerId, workspaceId)).resolves.toBe('manager');
    await expect(getWorkspaceRole(memberId, workspaceId)).resolves.toBe('member');
    await expect(getWorkspaceRole(randomUUID(), workspaceId)).resolves.toBeNull();
  });

  it('enforces the owner/manager/member management matrix', async () => {
    await expect(canManageMember(ownerId, managerMembershipId)).resolves.toBe(true);
    await expect(canManageMember(ownerId, memberMembershipId)).resolves.toBe(true);
    await expect(canManageMember(managerId, memberMembershipId)).resolves.toBe(true);
    await expect(canManageMember(managerId, managerMembershipId)).resolves.toBe(false);
    await expect(canManageMember(memberId, memberMembershipId)).resolves.toBe(false);
  });
});
