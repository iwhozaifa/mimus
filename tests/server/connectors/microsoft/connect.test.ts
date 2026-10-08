import { createServiceClient } from '@/src/db/service';
import { completeMicrosoftConnection } from '@/src/server/connectors/microsoft/connect';
import { pgByteaToBuffer } from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/server/connectors/microsoft/oauth', () => ({
  exchangeCode: vi.fn(),
}));

import { exchangeCode } from '@/src/server/connectors/microsoft/oauth';

describe('completeMicrosoftConnection', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.mocked(exchangeCode).mockResolvedValue({
      accountEmail: 'founder@example.com',
      serializedCache: 'serialized-cache-blob',
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(createdUserIds.map((id) => supabase.auth.admin.deleteUser(id)));
    createdUserIds.length = 0;
  });

  async function makeWorkspace() {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'MS connect test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'MS connect test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `ms-connect-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);
    return { workspaceId: workspace!.id as string, userId };
  }

  it('creates two sibling connected_accounts rows sharing external_account_id, with an encrypted cache blob', async () => {
    const { workspaceId, userId } = await makeWorkspace();

    const rows = await completeMicrosoftConnection({ workspaceId, userId, code: 'fake-code' });

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
      expect(secret?.encrypted_access_token).toBeNull();
      const stored = pgByteaToBuffer(secret!.encrypted_refresh_token as string);
      expect(stored.toString('utf8')).not.toContain('serialized-cache-blob');
    }
  });
});
