import { createServiceClient } from '@/src/db/service';
import { completeSlackConnection } from '@/src/server/connectors/slack/connect';
import { pgByteaToBuffer } from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/server/connectors/slack/oauth', () => ({
  exchangeCode: vi.fn(),
}));

import { exchangeCode } from '@/src/server/connectors/slack/oauth';

describe('completeSlackConnection', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.mocked(exchangeCode).mockResolvedValue({
      accessToken: 'xoxp-123',
      slackUserId: 'U123',
      teamId: 'T123',
      teamName: 'Acme',
      scope: 'channels:history,channels:read',
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
      .insert({ name: 'Slack connect test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Slack connect test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `slack-connect-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);
    return { workspaceId: workspace!.id as string, userId };
  }

  it('creates one connected_accounts row with an encrypted access token', async () => {
    const { workspaceId, userId } = await makeWorkspace();

    const rows = await completeSlackConnection({ workspaceId, userId, code: 'fake-code' });

    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.provider).toBe('slack');
    expect(row.account_type).toBe('slack');
    expect(row.external_account_id).toBe('U123');
    expect(row.visibility).toBe('private');
    expect(row.status).toBe('connected');
    expect(row.provider_team_id).toBe('T123');

    const { data: secret } = await supabase
      .from('connected_account_secrets')
      .select('*')
      .eq('connected_account_id', row.id)
      .single();
    expect(secret?.key_version).toBe(1);
    expect(secret?.encrypted_refresh_token).toBeNull();
    const stored = pgByteaToBuffer(secret!.encrypted_access_token as string);
    expect(stored.toString('utf8')).not.toContain('xoxp-123');
  });

  it('stores the granted scopes as an array', async () => {
    const { workspaceId, userId } = await makeWorkspace();

    const [row] = await completeSlackConnection({ workspaceId, userId, code: 'fake-code' });

    const { data: account } = await supabase
      .from('connected_accounts')
      .select('scopes')
      .eq('id', row.id)
      .single();
    expect(account?.scopes).toEqual(['channels:history', 'channels:read']);
  });
});
