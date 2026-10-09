import { createServiceClient } from '@/src/db/service';
import { disconnectSlackAccount } from '@/src/server/connectors/slack/disconnect';
import { saveSlackInstallation } from '@/src/server/connectors/slack/installations';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';
import { upsertMessage } from '@/src/server/shared/normalize';
import { randomUUID } from 'node:crypto';
import { WebClient } from '@slack/web-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Unique per run: test files run in parallel against one database, and
// installations are keyed by team id alone.
const TEAM = `T_DISCONNECT_${randomUUID()}`;

describe('disconnectSlackAccount', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await supabase.from('slack_installations').delete().eq('team_id', TEAM);
    await Promise.all(createdUserIds.map((id) => supabase.auth.admin.deleteUser(id)));
    createdUserIds.length = 0;
  });

  async function makeConnectedAccount(teamId: string | null = null) {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Slack disconnect test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Slack disconnect test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `slack-disconnect-${userId}@example.com`,
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
        external_account_id: 'U123',
        provider_team_id: teamId,
      })
      .select('id')
      .single()
      .throwOnError();

    const { ciphertext: encryptedAccessToken, keyVersion } = await encryptToken('xoxp-123');
    await supabase
      .from('connected_account_secrets')
      .insert({
        connected_account_id: account!.id,
        encrypted_access_token: bufferToPgBytea(encryptedAccessToken),
        key_version: keyVersion,
      })
      .throwOnError();

    return { workspaceId: workspace!.id as string, connectedAccountId: account!.id as string };
  }

  it('revokes the token, purges messages/people, deletes the secret, and marks disconnected', async () => {
    const { workspaceId, connectedAccountId } = await makeConnectedAccount();
    await upsertMessage(workspaceId, connectedAccountId, {
      providerMessageId: 'msg-1',
      direction: 'inbound',
    });

    const revokeSpy = vi
      .spyOn(WebClient.prototype, 'apiCall')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValue({ ok: true } as any);

    await disconnectSlackAccount(connectedAccountId);

    expect(revokeSpy.mock.calls[0]?.[0]).toBe('auth.revoke');

    const { data: account } = await supabase
      .from('connected_accounts')
      .select('status, disconnected_at')
      .eq('id', connectedAccountId)
      .single()
      .throwOnError();
    expect(account!.status).toBe('disconnected');
    expect(account!.disconnected_at).not.toBeNull();

    const { data: messages } = await supabase
      .from('messages')
      .select('id')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(messages).toHaveLength(0);

    const { data: secret } = await supabase
      .from('connected_account_secrets')
      .select('connected_account_id')
      .eq('connected_account_id', connectedAccountId)
      .maybeSingle()
      .throwOnError();
    expect(secret).toBeNull();
  });

  it("removes the team's stored bot token only once its last connected member disconnects", async () => {
    const first = await makeConnectedAccount(TEAM);
    const second = await makeConnectedAccount(TEAM);
    await saveSlackInstallation({
      teamId: TEAM,
      teamName: 'Acme',
      botToken: 'xoxb-acme',
      botUserId: 'B1',
      workspaceId: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(WebClient.prototype, 'apiCall').mockResolvedValue({ ok: true } as any);

    async function installationCount() {
      const { data } = await supabase
        .from('slack_installations')
        .select('team_id')
        .eq('team_id', TEAM)
        .throwOnError();
      return data!.length;
    }

    await disconnectSlackAccount(first.connectedAccountId);
    expect(await installationCount()).toBe(1);

    await disconnectSlackAccount(second.connectedAccountId);
    expect(await installationCount()).toBe(0);
  });
});
