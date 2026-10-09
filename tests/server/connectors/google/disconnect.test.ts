import { createServiceClient } from '@/src/db/service';
import { disconnectGoogleAccount } from '@/src/server/connectors/google/disconnect';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';
import { upsertEvent, upsertMessage } from '@/src/server/shared/normalize';
import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('disconnectGoogleAccount', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

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
    createdUserIds.length = 0;
  });

  async function makeWorkspace() {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Disconnect test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Disconnect test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `disconnect-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);
    return { workspaceId: workspace!.id as string, userId };
  }

  async function makeConnectedAccount(
    workspaceId: string,
    userId: string,
    accountType: 'email' | 'calendar',
    externalAccountId: string,
  ) {
    const { data: account } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: workspaceId,
        owner_user_id: userId,
        provider: 'google',
        account_type: accountType,
        external_account_id: externalAccountId,
      })
      .select('id')
      .single()
      .throwOnError();

    const { ciphertext: encryptedAccessToken, keyVersion } = await encryptToken('access-123');
    const { ciphertext: encryptedRefreshToken } = await encryptToken('refresh-123');
    await supabase
      .from('connected_account_secrets')
      .insert({
        connected_account_id: account!.id,
        encrypted_access_token: bufferToPgBytea(encryptedAccessToken),
        encrypted_refresh_token: bufferToPgBytea(encryptedRefreshToken),
        key_version: keyVersion,
      })
      .throwOnError();

    return account!.id as string;
  }

  it('disconnecting the last sibling revokes the token, purges content, and deletes secrets', async () => {
    const { workspaceId, userId } = await makeWorkspace();
    const connectedAccountId = await makeConnectedAccount(
      workspaceId,
      userId,
      'calendar',
      'founder@example.com',
    );
    await upsertEvent(workspaceId, connectedAccountId, {
      providerEventId: 'event-1',
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
    });

    const revokeSpy = vi
      .spyOn(google.auth.OAuth2.prototype, 'revokeToken')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValue({} as any);

    await disconnectGoogleAccount(connectedAccountId);

    expect(revokeSpy).toHaveBeenCalledWith('access-123');

    const { data: account } = await supabase
      .from('connected_accounts')
      .select('status, disconnected_at')
      .eq('id', connectedAccountId)
      .single()
      .throwOnError();
    expect(account!.status).toBe('disconnected');
    expect(account!.disconnected_at).not.toBeNull();

    const { data: events } = await supabase
      .from('events')
      .select('id')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(events).toHaveLength(0);

    const { data: secret } = await supabase
      .from('connected_account_secrets')
      .select('connected_account_id')
      .eq('connected_account_id', connectedAccountId)
      .maybeSingle()
      .throwOnError();
    expect(secret).toBeNull();
  });

  it("disconnecting one sibling leaves the other's content and token intact", async () => {
    const { workspaceId, userId } = await makeWorkspace();
    const calendarAccountId = await makeConnectedAccount(
      workspaceId,
      userId,
      'calendar',
      'founder@example.com',
    );
    const emailAccountId = await makeConnectedAccount(
      workspaceId,
      userId,
      'email',
      'founder@example.com',
    );
    await upsertMessage(workspaceId, emailAccountId, {
      providerMessageId: 'msg-1',
      direction: 'inbound',
    });

    const revokeSpy = vi
      .spyOn(google.auth.OAuth2.prototype, 'revokeToken')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValue({} as any);

    await disconnectGoogleAccount(calendarAccountId);

    expect(revokeSpy).not.toHaveBeenCalled();

    const { data: emailAccount } = await supabase
      .from('connected_accounts')
      .select('status')
      .eq('id', emailAccountId)
      .single()
      .throwOnError();
    expect(emailAccount!.status).toBe('connected');

    const { data: messages } = await supabase
      .from('messages')
      .select('id')
      .eq('connected_account_id', emailAccountId)
      .throwOnError();
    expect(messages).toHaveLength(1);

    const { data: emailSecret } = await supabase
      .from('connected_account_secrets')
      .select('connected_account_id')
      .eq('connected_account_id', emailAccountId)
      .maybeSingle()
      .throwOnError();
    expect(emailSecret).not.toBeNull();

    const { data: calendarSecret } = await supabase
      .from('connected_account_secrets')
      .select('connected_account_id')
      .eq('connected_account_id', calendarAccountId)
      .maybeSingle()
      .throwOnError();
    expect(calendarSecret).toBeNull();
  });

  it('revokes the grant even when another user still has the same Google address connected', async () => {
    const { workspaceId, userId } = await makeWorkspace();
    const { userId: colleagueId } = await makeWorkspace();
    const accountId = await makeConnectedAccount(
      workspaceId,
      userId,
      'email',
      'shared@example.com',
    );
    const colleagueAccountId = await makeConnectedAccount(
      workspaceId,
      colleagueId,
      'email',
      'shared@example.com',
    );

    const revokeSpy = vi
      .spyOn(google.auth.OAuth2.prototype, 'revokeToken')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValue({} as any);

    await disconnectGoogleAccount(accountId);

    // The colleague's row is their own grant, not a sibling of this one.
    expect(revokeSpy).toHaveBeenCalledWith('access-123');
    const { data: colleagueAccount } = await supabase
      .from('connected_accounts')
      .select('status')
      .eq('id', colleagueAccountId)
      .single()
      .throwOnError();
    expect(colleagueAccount!.status).toBe('connected');
  });
});
