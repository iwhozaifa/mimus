import { createServiceClient } from '@/src/db/service';
import { acceptInvite } from '@/src/server/invites/acceptInvite';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('acceptInvite', () => {
  const supabase = createServiceClient();
  const inviteeId = randomUUID();
  let workspaceId: string;

  beforeAll(async () => {
    const { error } = await supabase.auth.admin.createUser({
      id: inviteeId,
      email: `invitee-${inviteeId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;

    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Accept test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Accept test ws' })
      .select('id')
      .single()
      .throwOnError();
    workspaceId = workspace!.id;
  });

  afterAll(async () => {
    await supabase.auth.admin.deleteUser(inviteeId);
  });

  async function insertInvite(overrides: Partial<Record<string, unknown>> = {}) {
    const { data } = await supabase
      .from('invites')
      .insert({
        workspace_id: workspaceId,
        email: 'invitee@example.com',
        role: 'manager',
        token: randomUUID(),
        status: 'pending',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        ...overrides,
      })
      .select('token')
      .single()
      .throwOnError();
    return data!.token as string;
  }

  it('creates a membership with the invited role and marks the invite accepted', async () => {
    const token = await insertInvite();

    await acceptInvite({ token, userId: inviteeId });

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', inviteeId)
      .single();
    expect(membership?.role).toBe('manager');

    const { data: invite } = await supabase
      .from('invites')
      .select('status')
      .eq('token', token)
      .single();
    expect(invite?.status).toBe('accepted');
  });

  it('rejects an expired invite', async () => {
    const token = await insertInvite({
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    await expect(acceptInvite({ token, userId: randomUUID() })).rejects.toThrow();
  });

  it('rejects an already-accepted invite', async () => {
    const token = await insertInvite({ status: 'accepted' });

    await expect(acceptInvite({ token, userId: randomUUID() })).rejects.toThrow();
  });

  it('accepts without changing the role when the user is already a member', async () => {
    // The first test made the invitee a manager of this workspace.
    const token = await insertInvite({ role: 'member' });

    await expect(acceptInvite({ token, userId: inviteeId })).resolves.toBeUndefined();

    const { data: memberships } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', inviteeId)
      .throwOnError();
    expect(memberships).toEqual([{ role: 'manager' }]);

    const { data: invite } = await supabase
      .from('invites')
      .select('status')
      .eq('token', token)
      .single();
    expect(invite?.status).toBe('accepted');
  });
});
