import { createServiceClient } from '@/src/db/service';
import { refreshAndStoreTokens } from '@/src/server/connectors/google/oauth';
import {
  bufferToPgBytea,
  decryptToken,
  encryptToken,
  pgByteaToBuffer,
} from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('refreshAndStoreTokens', () => {
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
      .insert({ name: 'Refresh test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Refresh test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `refresh-${userId}@example.com`,
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

    const { ciphertext: encryptedAccessToken, keyVersion } = await encryptToken('old-access');
    const { ciphertext: encryptedRefreshToken } = await encryptToken('old-refresh');
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

  async function storedTokens(connectedAccountId: string) {
    const { data: secret } = await supabase
      .from('connected_account_secrets')
      .select('encrypted_access_token, encrypted_refresh_token, key_version')
      .eq('connected_account_id', connectedAccountId)
      .single()
      .throwOnError();
    return {
      accessToken: await decryptToken(
        pgByteaToBuffer(secret!.encrypted_access_token as string),
        secret!.key_version,
      ),
      refreshToken: await decryptToken(
        pgByteaToBuffer(secret!.encrypted_refresh_token as string),
        secret!.key_version,
      ),
    };
  }

  it('fans a refreshed token pair out to both sibling rows, leaving unrelated accounts untouched', async () => {
    const { workspaceId, userId } = await makeWorkspace();
    const emailAccountId = await makeConnectedAccount(
      workspaceId,
      userId,
      'email',
      'founder@example.com',
    );
    const calendarAccountId = await makeConnectedAccount(
      workspaceId,
      userId,
      'calendar',
      'founder@example.com',
    );
    const unrelatedAccountId = await makeConnectedAccount(
      workspaceId,
      userId,
      'email',
      'someone-else@example.com',
    );

    vi.spyOn(google.auth.OAuth2.prototype, 'refreshAccessToken').mockResolvedValue({
      credentials: {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expiry_date: 999,
        scope: 'a b',
      },
      res: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await refreshAndStoreTokens(emailAccountId);

    const emailTokens = await storedTokens(emailAccountId);
    expect(emailTokens).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });

    const calendarTokens = await storedTokens(calendarAccountId);
    expect(calendarTokens).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });

    const unrelatedTokens = await storedTokens(unrelatedAccountId);
    expect(unrelatedTokens).toEqual({ accessToken: 'old-access', refreshToken: 'old-refresh' });
  });
});
