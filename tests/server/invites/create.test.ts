import { createServiceClient } from '@/src/db/service';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/server/email/sendInviteEmail', () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

const { sendInviteEmail } = await import('@/src/server/email/sendInviteEmail');
const { createInvite } = await import('@/src/server/invites/createInvite');

describe('createInvite', () => {
  const supabase = createServiceClient();
  const ownerId = randomUUID();
  const managerId = randomUUID();
  let workspaceId: string;

  beforeAll(async () => {
    for (const [id, name] of [
      [ownerId, 'owner'],
      [managerId, 'manager'],
    ] as const) {
      const { error } = await supabase.auth.admin.createUser({
        id,
        email: `${name}-${id}@example.com`,
        email_confirm: true,
      });
      if (error) throw error;
    }

    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Invite test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Invite test ws' })
      .select('id')
      .single()
      .throwOnError();
    workspaceId = workspace!.id;

    await supabase
      .from('workspace_members')
      .insert([
        { workspace_id: workspaceId, user_id: ownerId, role: 'owner' },
        { workspace_id: workspaceId, user_id: managerId, role: 'manager' },
      ])
      .throwOnError();
  });

  afterAll(async () => {
    await supabase.auth.admin.deleteUser(ownerId);
    await supabase.auth.admin.deleteUser(managerId);
  });

  beforeEach(() => {
    vi.mocked(sendInviteEmail).mockClear();
  });

  it('lets the owner invite at any role and sends the email', async () => {
    const invite = await createInvite({
      workspaceId,
      workspaceName: 'Invite test ws',
      invitedByUserId: ownerId,
      email: 'new-manager@example.com',
      role: 'manager',
      baseUrl: 'http://127.0.0.1:3000',
    });

    expect(invite.role).toBe('manager');
    expect(invite.status).toBe('pending');
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'new-manager@example.com' }),
    );
  });

  it('lets a manager invite a member', async () => {
    const invite = await createInvite({
      workspaceId,
      workspaceName: 'Invite test ws',
      invitedByUserId: managerId,
      email: 'new-member@example.com',
      role: 'member',
      baseUrl: 'http://127.0.0.1:3000',
    });

    expect(invite.role).toBe('member');
  });

  it('forbids a manager from inviting another manager, and sends no email', async () => {
    await expect(
      createInvite({
        workspaceId,
        workspaceName: 'Invite test ws',
        invitedByUserId: managerId,
        email: 'blocked@example.com',
        role: 'manager',
        baseUrl: 'http://127.0.0.1:3000',
      }),
    ).rejects.toThrow();

    expect(sendInviteEmail).not.toHaveBeenCalled();
  });
});
