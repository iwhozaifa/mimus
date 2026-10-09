import { createServiceClient } from '@/src/db/service';
import { acceptInvite } from '@/src/server/invites/acceptInvite';
import {
  inviteTokenFromPath,
  provisionAfterSignIn,
} from '@/src/server/workspaces/provisionAfterSignIn';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('inviteTokenFromPath', () => {
  it('extracts the token from an invite path', () => {
    expect(inviteTokenFromPath('/invite/abc-123')).toBe('abc-123');
  });

  it('rejects anything that is not exactly /invite/<token>', () => {
    for (const path of [
      '/',
      '/invite/',
      '/invite/x/extra',
      '/invites/x',
      '/invite/x?y=1',
      '/invite/x#y',
      '//evil.example/invite/x',
    ]) {
      expect(inviteTokenFromPath(path)).toBeNull();
    }
  });
});

describe('provisionAfterSignIn', () => {
  const supabase = createServiceClient();
  const userIds: string[] = [];
  let inviteWorkspaceId: string;

  beforeAll(async () => {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Provision test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Provision test ws' })
      .select('id')
      .single()
      .throwOnError();
    inviteWorkspaceId = workspace!.id;
  });

  afterAll(async () => {
    for (const id of userIds) await supabase.auth.admin.deleteUser(id);
  });

  async function newUser() {
    const id = randomUUID();
    const email = `provision-${id}@example.com`;
    const { error } = await supabase.auth.admin.createUser({ id, email, email_confirm: true });
    if (error) throw error;
    userIds.push(id);
    return { userId: id, email };
  }

  async function insertInvite(overrides: Partial<Record<string, unknown>> = {}) {
    const { data } = await supabase
      .from('invites')
      .insert({
        workspace_id: inviteWorkspaceId,
        email: 'provision-invitee@example.com',
        role: 'member',
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

  async function memberships(userId: string) {
    const { data } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', userId)
      .throwOnError();
    return data!;
  }

  it('provisions an owner workspace for a normal sign-in', async () => {
    const user = await newUser();

    await expect(provisionAfterSignIn({ ...user, next: '/' })).resolves.toBe('provisioned');

    const rows = await memberships(user.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('owner');
  });

  it('skips provisioning when signing in to accept a pending invite', async () => {
    const user = await newUser();
    const token = await insertInvite();

    await expect(provisionAfterSignIn({ ...user, next: `/invite/${token}` })).resolves.toBe(
      'skipped_for_invite',
    );
    expect(await memberships(user.userId)).toHaveLength(0);

    // The profile is identity, not a workspace: peers in the invited
    // workspace read the invitee's email from it.
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', user.userId)
      .maybeSingle()
      .throwOnError();
    expect(profile).toEqual({ email: user.email });
  });

  it.each([
    ['expired', { expires_at: new Date(Date.now() - 60_000).toISOString() }],
    ['already accepted', { status: 'accepted' }],
  ])('still provisions when the invite is %s', async (_label, overrides) => {
    const user = await newUser();
    const token = await insertInvite(overrides);

    await expect(provisionAfterSignIn({ ...user, next: `/invite/${token}` })).resolves.toBe(
      'provisioned',
    );
    expect(await memberships(user.userId)).toHaveLength(1);
  });

  it('still provisions when the invite token is unknown', async () => {
    const user = await newUser();

    await expect(provisionAfterSignIn({ ...user, next: `/invite/${randomUUID()}` })).resolves.toBe(
      'provisioned',
    );
    expect(await memberships(user.userId)).toHaveLength(1);
  });

  // Regression: a new user signing in through an invite link used to get an
  // auto-created owner workspace *and* the invited membership.
  it('leaves an invitee with exactly one membership, in the invited workspace', async () => {
    const user = await newUser();
    const token = await insertInvite({ role: 'manager' });

    await provisionAfterSignIn({ ...user, next: `/invite/${token}` });
    await acceptInvite({ token, userId: user.userId });

    expect(await memberships(user.userId)).toEqual([
      { workspace_id: inviteWorkspaceId, role: 'manager' },
    ]);
  });
});
