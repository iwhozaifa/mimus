import { createServiceClient } from '@/src/db/service';
import { refreshAndStoreTokens } from '@/src/server/connectors/calendly/oauth';
import {
  bufferToPgBytea,
  decryptToken,
  encryptToken,
  pgByteaToBuffer,
} from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('calendly refreshAndStoreTokens', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.stubEnv('CALENDLY_CLIENT_ID', 'test-client-id');
    vi.stubEnv('CALENDLY_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv(
      'CALENDLY_OAUTH_REDIRECT_URI',
      'http://localhost:3000/api/connectors/calendly/callback',
    );
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await Promise.all(createdUserIds.map((id) => supabase.auth.admin.deleteUser(id)));
    createdUserIds.length = 0;
  });

  async function makeConnectedAccount() {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Calendly refresh test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Calendly refresh test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `calendly-refresh-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);

    const { data: account } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: workspace!.id,
        owner_user_id: userId,
        provider: 'calendly',
        account_type: 'scheduling',
        external_account_id: 'https://api.calendly.com/users/abc',
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

  it('overwrites both the access and refresh token with the rotated pair', async () => {
    const connectedAccountId = await makeConnectedAccount();

    // Only intercepts Calendly's own token endpoint -- everything else
    // (the real local Supabase REST calls this function makes) passes
    // through untouched, since supabase-js shares this same global fetch.
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
      String(input).includes('calendly.com')
        ? new Response(
            JSON.stringify({
              access_token: 'new-access',
              refresh_token: 'new-refresh',
              expires_in: 7200,
              owner: 'https://api.calendly.com/users/abc',
              organization: 'https://api.calendly.com/organizations/def',
            }),
            { status: 200 },
          )
        : realFetch(input, init),
    );

    await refreshAndStoreTokens(connectedAccountId);

    const { data: secret } = await supabase
      .from('connected_account_secrets')
      .select('encrypted_access_token, encrypted_refresh_token, key_version')
      .eq('connected_account_id', connectedAccountId)
      .single()
      .throwOnError();
    const accessToken = await decryptToken(
      pgByteaToBuffer(secret!.encrypted_access_token as string),
      secret!.key_version,
    );
    const refreshToken = await decryptToken(
      pgByteaToBuffer(secret!.encrypted_refresh_token as string),
      secret!.key_version,
    );
    expect(accessToken).toBe('new-access');
    expect(refreshToken).toBe('new-refresh');
  });
});
