import { createServiceClient } from '@/src/db/service';
import { refreshAndStoreTokens } from '@/src/server/connectors/microsoft/oauth';
import {
  bufferToPgBytea,
  decryptToken,
  encryptToken,
  pgByteaToBuffer,
} from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('refreshAndStoreTokens (microsoft)', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.stubEnv('MICROSOFT_OAUTH_CLIENT_ID', 'test-client-id');
    vi.stubEnv('MICROSOFT_OAUTH_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv(
      'MICROSOFT_OAUTH_REDIRECT_URI',
      'http://localhost:3000/api/connectors/microsoft/callback',
    );
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
      .insert({ name: 'MS refresh test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'MS refresh test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `ms-refresh-${userId}@example.com`,
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
        provider: 'microsoft',
        account_type: accountType,
        external_account_id: externalAccountId,
      })
      .select('id')
      .single()
      .throwOnError();

    const { ciphertext, keyVersion } = await encryptToken('old-cache-blob');
    await supabase
      .from('connected_account_secrets')
      .insert({
        connected_account_id: account!.id,
        encrypted_refresh_token: bufferToPgBytea(ciphertext),
        key_version: keyVersion,
      })
      .throwOnError();

    return account!.id as string;
  }

  async function storedCache(connectedAccountId: string) {
    const { data: secret } = await supabase
      .from('connected_account_secrets')
      .select('encrypted_refresh_token, key_version')
      .eq('connected_account_id', connectedAccountId)
      .single()
      .throwOnError();
    return decryptToken(
      pgByteaToBuffer(secret!.encrypted_refresh_token as string),
      secret!.key_version,
    );
  }

  it('fans a refreshed cache out to both sibling rows, leaving unrelated accounts untouched', async () => {
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

    vi.spyOn(ConfidentialClientApplication.prototype, 'getTokenCache').mockReturnValue({
      getAllAccounts: async () => [{ username: 'founder@example.com' }],
      deserialize: () => {},
      serialize: () => 'new-cache-blob',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.spyOn(ConfidentialClientApplication.prototype, 'acquireTokenSilent').mockResolvedValue({
      accessToken: 'new-access',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await refreshAndStoreTokens(emailAccountId);

    expect(await storedCache(emailAccountId)).toBe('new-cache-blob');
    expect(await storedCache(calendarAccountId)).toBe('new-cache-blob');
    expect(await storedCache(unrelatedAccountId)).toBe('old-cache-blob');
  });
});
