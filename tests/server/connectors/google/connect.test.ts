import { createServiceClient } from '@/src/db/service';
import { completeGoogleConnection } from '@/src/server/connectors/google/connect';
import { decryptToken, pgByteaToBuffer } from '@/src/server/crypto/tokenVault';
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

  async function activeRows(workspaceId: string, userId: string) {
    const { data } = await supabase
      .from('connected_accounts')
      .select('id, account_type, external_account_id, status, visibility')
      .eq('workspace_id', workspaceId)
      .eq('owner_user_id', userId)
      .neq('status', 'disconnected')
      .throwOnError();
    return data!;
  }

  async function storedAccessToken(connectedAccountId: string) {
    const { data: secret } = await supabase
      .from('connected_account_secrets')
      .select('encrypted_access_token, key_version')
      .eq('connected_account_id', connectedAccountId)
      .single()
      .throwOnError();
    return decryptToken(
      pgByteaToBuffer(secret!.encrypted_access_token as string),
      secret!.key_version,
    );
  }

  it('connects a second, different Google account for the same user alongside the first', async () => {
    const { workspaceId, userId } = await makeWorkspace();

    await completeGoogleConnection({ workspaceId, userId, code: 'code-1' });
    vi.mocked(getAuthenticatedEmail).mockResolvedValue('second@example.com');
    const second = await completeGoogleConnection({ workspaceId, userId, code: 'code-2' });

    expect(second.map((r) => r.external_account_id)).toEqual([
      'second@example.com',
      'second@example.com',
    ]);
    const rows = await activeRows(workspaceId, userId);
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.external_account_id))).toEqual(
      new Set(['founder@example.com', 'second@example.com']),
    );
  });

  it('reconnecting the same Google account reuses its rows, rotating tokens and keeping visibility', async () => {
    const { workspaceId, userId } = await makeWorkspace();
    const first = await completeGoogleConnection({ workspaceId, userId, code: 'code-1' });
    const emailRow = first.find((r) => r.account_type === 'email')!;
    await supabase
      .from('connected_accounts')
      .update({ visibility: 'team', status: 'needs_reauth' })
      .eq('id', emailRow.id)
      .throwOnError();

    vi.mocked(exchangeCode).mockResolvedValue({
      accessToken: 'access-rotated',
      refreshToken: 'refresh-rotated',
      expiryDate: null,
      scope: null,
    });
    // Google addresses are case-insensitive.
    vi.mocked(getAuthenticatedEmail).mockResolvedValue('Founder@Example.com');
    const second = await completeGoogleConnection({ workspaceId, userId, code: 'code-2' });

    expect(second.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort());
    const rows = await activeRows(workspaceId, userId);
    expect(rows).toHaveLength(2);
    const reconnectedEmail = rows.find((r) => r.id === emailRow.id)!;
    expect(reconnectedEmail.status).toBe('connected');
    expect(reconnectedEmail.visibility).toBe('team');
    for (const row of rows) {
      expect(await storedAccessToken(row.id)).toBe('access-rotated');
    }
  });

  it('reconnecting after a disconnect creates fresh rows', async () => {
    const { workspaceId, userId } = await makeWorkspace();
    const first = await completeGoogleConnection({ workspaceId, userId, code: 'code-1' });
    await supabase
      .from('connected_accounts')
      .update({ status: 'disconnected' })
      .in(
        'id',
        first.map((r) => r.id),
      )
      .throwOnError();

    const second = await completeGoogleConnection({ workspaceId, userId, code: 'code-2' });

    expect(second).toHaveLength(2);
    for (const row of second) {
      expect(first.map((r) => r.id)).not.toContain(row.id);
    }
    expect(await activeRows(workspaceId, userId)).toHaveLength(2);
  });
});
