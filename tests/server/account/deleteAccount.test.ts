import { createServiceClient } from '@/src/db/service';
import {
  AccountDeletionBlockedError,
  deleteAccount,
  getAccountDeletionBlockers,
} from '@/src/server/account/deleteAccount';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';
import { upsertMessage } from '@/src/server/shared/normalize';
import { google } from 'googleapis';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('deleteAccount', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];
  const createdCompanyIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('GOOGLE_OAUTH_REDIRECT_URI', 'http://localhost:3000/api/connectors/google/callback');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await Promise.all(createdUserIds.map((id) => supabase.auth.admin.deleteUser(id)));
    await supabase.from('companies').delete().in('id', createdCompanyIds);
    createdUserIds.length = 0;
    createdCompanyIds.length = 0;
  });

  async function makeUser() {
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `delete-account-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);
    return userId;
  }

  async function makeWorkspace(name: string) {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: `${name} co` })
      .select('id')
      .single()
      .throwOnError();
    createdCompanyIds.push(company!.id as string);
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name })
      .select('id')
      .single()
      .throwOnError();
    return { companyId: company!.id as string, workspaceId: workspace!.id as string };
  }

  async function addMember(workspaceId: string, userId: string, role: 'owner' | 'member') {
    await supabase
      .from('workspace_members')
      .insert({ workspace_id: workspaceId, user_id: userId, role })
      .throwOnError();
  }

  async function connectGoogle(workspaceId: string, userId: string) {
    const { data: account } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: workspaceId,
        owner_user_id: userId,
        provider: 'google',
        account_type: 'email',
        external_account_id: `${userId}@example.com`,
      })
      .select('id')
      .single()
      .throwOnError();
    const { ciphertext, keyVersion } = await encryptToken(`access-${userId}`);
    await supabase
      .from('connected_account_secrets')
      .insert({
        connected_account_id: account!.id,
        encrypted_access_token: bufferToPgBytea(ciphertext),
        key_version: keyVersion,
      })
      .throwOnError();
    await upsertMessage(workspaceId, account!.id as string, {
      providerMessageId: `msg-${userId}`,
      subject: 'Renewal',
      bodyText: 'Private email body',
      direction: 'inbound',
    });
    return account!.id as string;
  }

  function mockGoogleRevoke() {
    return (
      vi
        .spyOn(google.auth.OAuth2.prototype, 'revokeToken')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockResolvedValue({} as any)
    );
  }

  async function userExists(userId: string) {
    const { data } = await supabase.auth.admin.getUserById(userId);
    return Boolean(data.user);
  }

  it("a sole member's account, workspace, company and connected data are all deleted", async () => {
    const userId = await makeUser();
    const { companyId, workspaceId } = await makeWorkspace('Solo');
    await addMember(workspaceId, userId, 'owner');
    const accountId = await connectGoogle(workspaceId, userId);
    const revokeSpy = mockGoogleRevoke();

    expect(await getAccountDeletionBlockers(userId)).toEqual([]);
    await deleteAccount(userId);

    expect(revokeSpy).toHaveBeenCalledWith(`access-${userId}`);
    expect(await userExists(userId)).toBe(false);

    const { data: messages } = await supabase
      .from('messages')
      .select('id')
      .eq('connected_account_id', accountId)
      .throwOnError();
    expect(messages).toHaveLength(0);

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .maybeSingle()
      .throwOnError();
    expect(workspace).toBeNull();

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .maybeSingle()
      .throwOnError();
    expect(company).toBeNull();
  });

  it("leaving a shared workspace keeps the workspace and the teammates' data", async () => {
    const leaverId = await makeUser();
    const coOwnerId = await makeUser();
    const { workspaceId } = await makeWorkspace('Shared');
    await addMember(workspaceId, leaverId, 'owner');
    await addMember(workspaceId, coOwnerId, 'owner');
    const leaverAccountId = await connectGoogle(workspaceId, leaverId);
    const coOwnerAccountId = await connectGoogle(workspaceId, coOwnerId);
    mockGoogleRevoke();

    await deleteAccount(leaverId);

    expect(await userExists(leaverId)).toBe(false);
    expect(await userExists(coOwnerId)).toBe(true);

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .single()
      .throwOnError();
    expect(workspace).not.toBeNull();

    const { data: leaverAccount } = await supabase
      .from('connected_accounts')
      .select('id')
      .eq('id', leaverAccountId)
      .maybeSingle()
      .throwOnError();
    expect(leaverAccount).toBeNull();

    const { data: coOwnerMessages } = await supabase
      .from('messages')
      .select('id')
      .eq('connected_account_id', coOwnerAccountId)
      .throwOnError();
    expect(coOwnerMessages).toHaveLength(1);
  });

  it('a failed token revocation still deletes the account and its data', async () => {
    const userId = await makeUser();
    const { workspaceId } = await makeWorkspace('Revoke fails');
    await addMember(workspaceId, userId, 'owner');
    const accountId = await connectGoogle(workspaceId, userId);
    vi.spyOn(google.auth.OAuth2.prototype, 'revokeToken').mockRejectedValue(
      new Error('invalid_token'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await deleteAccount(userId);

    expect(await userExists(userId)).toBe(false);
    const { data: messages } = await supabase
      .from('messages')
      .select('id')
      .eq('connected_account_id', accountId)
      .throwOnError();
    expect(messages).toHaveLength(0);
  });

  it('the only Owner of a workspace with other members is blocked, and nothing is deleted', async () => {
    const ownerId = await makeUser();
    const memberId = await makeUser();
    const { workspaceId } = await makeWorkspace('Team');
    await addMember(workspaceId, ownerId, 'owner');
    await addMember(workspaceId, memberId, 'member');
    const accountId = await connectGoogle(workspaceId, ownerId);
    const revokeSpy = mockGoogleRevoke();

    const blockers = await getAccountDeletionBlockers(ownerId);
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/only Owner of “Team”/);

    await expect(deleteAccount(ownerId)).rejects.toBeInstanceOf(AccountDeletionBlockedError);

    expect(revokeSpy).not.toHaveBeenCalled();
    expect(await userExists(ownerId)).toBe(true);
    const { data: messages } = await supabase
      .from('messages')
      .select('id')
      .eq('connected_account_id', accountId)
      .throwOnError();
    expect(messages).toHaveLength(1);
  });

  it('a workspace that would be deleted while it has an active subscription blocks deletion', async () => {
    const userId = await makeUser();
    const { workspaceId } = await makeWorkspace('Paid');
    await addMember(workspaceId, userId, 'owner');
    await supabase
      .from('workspace_subscriptions')
      .insert({ workspace_id: workspaceId, status: 'active' })
      .throwOnError();

    const blockers = await getAccountDeletionBlockers(userId);
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/“Paid” has an active subscription/);
    await expect(deleteAccount(userId)).rejects.toBeInstanceOf(AccountDeletionBlockedError);
    expect(await userExists(userId)).toBe(true);
  });
});
