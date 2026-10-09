import { createServiceClient } from '@/src/db/service';
import { completeSlackConnection } from '@/src/server/connectors/slack/connect';
import { decryptToken, pgByteaToBuffer } from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/server/connectors/slack/oauth', () => ({
  exchangeCode: vi.fn(),
}));

import { exchangeCode } from '@/src/server/connectors/slack/oauth';

function tokensFor(teamId: string, teamName: string, accessToken: string) {
  return {
    accessToken,
    slackUserId: 'U123',
    teamId,
    teamName,
    teamDomain: `${teamName.toLowerCase()}.slack.com`,
    scope: 'channels:history,channels:read',
    botAccessToken: `xoxb-${teamId}`,
    botUserId: 'B123',
  };
}

// Unique per run: test files run in parallel against one database, and
// installations are keyed by team id alone.
const ACME = `T_ACME_${randomUUID()}`;
const GLOBEX = `T_GLOBEX_${randomUUID()}`;

describe('completeSlackConnection', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.mocked(exchangeCode).mockResolvedValue(tokensFor(ACME, 'Acme', 'xoxp-123'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await supabase.from('slack_installations').delete().in('team_id', [ACME, GLOBEX]);
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
    expect(row.provider_team_id).toBe(ACME);

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

  async function storedAccessToken(accountId: string) {
    const { data: secret } = await supabase
      .from('connected_account_secrets')
      .select('encrypted_access_token, key_version')
      .eq('connected_account_id', accountId)
      .single()
      .throwOnError();
    return decryptToken(
      pgByteaToBuffer(secret!.encrypted_access_token as string),
      secret!.key_version as number,
    );
  }

  it('records the Slack workspace name and saves the team bot token', async () => {
    const { workspaceId, userId } = await makeWorkspace();

    const [row] = await completeSlackConnection({ workspaceId, userId, code: 'fake-code' });

    const { data: account } = await supabase
      .from('connected_accounts')
      .select('provider_team_name')
      .eq('id', row.id)
      .single();
    expect(account?.provider_team_name).toBe('Acme');

    const { data: installation } = await supabase
      .from('slack_installations')
      .select('team_name, bot_user_id, installed_by_workspace_id')
      .eq('team_id', ACME)
      .single();
    expect(installation).toEqual({
      team_name: 'Acme',
      bot_user_id: 'B123',
      installed_by_workspace_id: workspaceId,
    });
  });

  it('connects a second Slack workspace as its own row', async () => {
    const { workspaceId, userId } = await makeWorkspace();

    const [first] = await completeSlackConnection({ workspaceId, userId, code: 'code-1' });
    vi.mocked(exchangeCode).mockResolvedValue(tokensFor(GLOBEX, 'Globex', 'xoxp-456'));
    const [second] = await completeSlackConnection({ workspaceId, userId, code: 'code-2' });

    expect(second.id).not.toBe(first.id);
    const { data: rows } = await supabase
      .from('connected_accounts')
      .select('provider_team_id')
      .eq('owner_user_id', userId)
      .order('provider_team_id')
      .throwOnError();
    expect(rows).toEqual([{ provider_team_id: ACME }, { provider_team_id: GLOBEX }]);
  });

  it('reconnecting the same Slack workspace reuses the row and rotates the token', async () => {
    const { workspaceId, userId } = await makeWorkspace();
    const [first] = await completeSlackConnection({ workspaceId, userId, code: 'code-1' });
    await supabase
      .from('connected_accounts')
      .update({ status: 'needs_reauth', visibility: 'team' })
      .eq('id', first.id)
      .throwOnError();

    vi.mocked(exchangeCode).mockResolvedValue(tokensFor(ACME, 'Acme', 'xoxp-rotated'));
    const [again] = await completeSlackConnection({ workspaceId, userId, code: 'code-2' });

    expect(again.id).toBe(first.id);
    expect(again.status).toBe('connected');
    expect(again.visibility).toBe('team');
    const { data: rows } = await supabase
      .from('connected_accounts')
      .select('id')
      .eq('owner_user_id', userId)
      .throwOnError();
    expect(rows).toHaveLength(1);
    expect(await storedAccessToken(first.id)).toBe('xoxp-rotated');
  });

  it('reconnecting after a disconnect creates a fresh row', async () => {
    const { workspaceId, userId } = await makeWorkspace();
    const [first] = await completeSlackConnection({ workspaceId, userId, code: 'code-1' });
    await supabase
      .from('connected_accounts')
      .update({ status: 'disconnected' })
      .eq('id', first.id)
      .throwOnError();

    const [again] = await completeSlackConnection({ workspaceId, userId, code: 'code-2' });

    expect(again.id).not.toBe(first.id);
    expect(again.status).toBe('connected');
  });
});
