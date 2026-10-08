import { createServiceClient } from '@/src/db/service';
import { completeGoogleConnection } from '@/src/server/connectors/google/connect';
import { pgByteaToBuffer } from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/server/connectors/google/oauth', () => ({
  exchangeCode: vi.fn(),
  getAuthenticatedEmail: vi.fn(),
}));

import { exchangeCode, getAuthenticatedEmail } from '@/src/server/connectors/google/oauth';

describe('completeGoogleConnection', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.mocked(exchangeCode).mockResolvedValue({
      accessToken: 'access-123',
      refreshToken: 'refresh-123',
      expiryDate: 1234567890,
      scope:
        'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly',
    });
    vi.mocked(getAuthenticatedEmail).mockResolvedValue('founder@example.com');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(createdUserIds.map((id) => supabase.auth.admin.deleteUser(id)));
    createdUserIds.length = 0;
  });

  async function makeWorkspace() {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Connect test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Connect test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `connect-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);
    return { workspaceId: workspace!.id as string, userId };
  }

  it('creates two sibling connected_accounts rows sharing external_account_id, with encrypted secrets', async () => {
    const { workspaceId, userId } = await makeWorkspace();

    const rows = await completeGoogleConnection({ workspaceId, userId, code: 'fake-code' });

    expect(rows).toHaveLength(2);
    const accountTypes = rows.map((r) => r.account_type).sort();
    expect(accountTypes).toEqual(['calendar', 'email']);
    for (const row of rows) {
      expect(row.external_account_id).toBe('founder@example.com');
      expect(row.visibility).toBe('private');
      expect(row.status).toBe('connected');
    }

    for (const row of rows) {
      const { data: secret } = await supabase
        .from('connected_account_secrets')
        .select('*')
        .eq('connected_account_id', row.id)
        .single();
      expect(secret?.key_version).toBe(1);
      // the stored ciphertext must not contain the plaintext access token.
      const stored = pgByteaToBuffer(secret!.encrypted_access_token as string);
      expect(stored.toString('utf8')).not.toContain('access-123');
    }
  });

  it('throws if Google does not return a refresh token', async () => {
    vi.mocked(exchangeCode).mockResolvedValue({
      accessToken: 'access-123',
      refreshToken: null,
      expiryDate: null,
      scope: null,
    });
    const { workspaceId, userId } = await makeWorkspace();

    await expect(
      completeGoogleConnection({ workspaceId, userId, code: 'fake-code' }),
    ).rejects.toThrow(/did not return a refresh token/);
  });
});
