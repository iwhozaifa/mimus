import { createServiceClient } from '@/src/db/service';
import {
  deleteSlackInstallationIfUnused,
  getBotClient,
  saveSlackInstallation,
} from '@/src/server/connectors/slack/installations';
import { pgByteaToBuffer } from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('slack installations', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];
  const createdTeamIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await supabase.from('slack_installations').delete().in('team_id', createdTeamIds);
    await Promise.all(createdUserIds.map((id) => supabase.auth.admin.deleteUser(id)));
    createdUserIds.length = 0;
    createdTeamIds.length = 0;
  });

  function newTeamId() {
    const teamId = `T_${randomUUID()}`;
    createdTeamIds.push(teamId);
    return teamId;
  }

  async function makeSlackAccount(teamId: string) {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Slack install test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Slack install test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `slack-install-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);
    const { data: account } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: workspace!.id,
        owner_user_id: userId,
        provider: 'slack',
        account_type: 'slack',
        external_account_id: `U_${userId}`,
        provider_team_id: teamId,
      })
      .select('id')
      .single()
      .throwOnError();
    return { workspaceId: workspace!.id as string, accountId: account!.id as string };
  }

  it('stores the bot token encrypted and hands back a client using it', async () => {
    const teamId = newTeamId();

    await saveSlackInstallation({
      teamId,
      teamName: 'Acme',
      botToken: 'xoxb-first',
      botUserId: 'B1',
      workspaceId: null,
    });

    const { data: row } = await supabase
      .from('slack_installations')
      .select('*')
      .eq('team_id', teamId)
      .single()
      .throwOnError();
    expect(row!.team_name).toBe('Acme');
    expect(row!.bot_user_id).toBe('B1');
    expect(pgByteaToBuffer(row!.encrypted_bot_token as string).toString('utf8')).not.toContain(
      'xoxb-first',
    );

    const client = await getBotClient(teamId);
    expect(client.token).toBe('xoxb-first');
  });

  it('reinstalling the same team keeps one row and rotates the token', async () => {
    const teamId = newTeamId();
    const base = { teamId, teamName: 'Acme', botUserId: 'B1', workspaceId: null };

    await saveSlackInstallation({ ...base, botToken: 'xoxb-first' });
    await saveSlackInstallation({ ...base, botToken: 'xoxb-second' });

    const { data: rows } = await supabase
      .from('slack_installations')
      .select('team_id')
      .eq('team_id', teamId)
      .throwOnError();
    expect(rows).toHaveLength(1);
    expect((await getBotClient(teamId)).token).toBe('xoxb-second');
  });

  it('throws a clear error for a team that never installed the app', async () => {
    await expect(getBotClient(newTeamId())).rejects.toThrow(/No Slack installation for team/);
  });

  it('keeps the installation while any connected account for the team remains', async () => {
    const teamId = newTeamId();
    const first = await makeSlackAccount(teamId);
    const second = await makeSlackAccount(teamId);
    await saveSlackInstallation({
      teamId,
      teamName: 'Acme',
      botToken: 'xoxb-first',
      botUserId: 'B1',
      workspaceId: first.workspaceId,
    });

    await supabase
      .from('connected_accounts')
      .update({ status: 'disconnected' })
      .eq('id', first.accountId)
      .throwOnError();
    await deleteSlackInstallationIfUnused(teamId);
    expect((await getBotClient(teamId)).token).toBe('xoxb-first');

    await supabase
      .from('connected_accounts')
      .update({ status: 'disconnected' })
      .eq('id', second.accountId)
      .throwOnError();
    await deleteSlackInstallationIfUnused(teamId);
    await expect(getBotClient(teamId)).rejects.toThrow(/No Slack installation for team/);
  });
});
