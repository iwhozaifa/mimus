import { createServiceClient } from '@/src/db/service';
import { handleSlackEvent } from '@/src/server/connectors/slack/events';
import { randomUUID } from 'node:crypto';
import { createHmac } from 'node:crypto';
import { WebClient } from '@slack/web-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function sign(secret: string, timestamp: string, rawBody: string): string {
  return 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex');
}

function makeRequest(secret: string, body: unknown): Request {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request('https://example.com/api/webhooks/slack/events', {
    method: 'POST',
    headers: {
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': sign(secret, timestamp, rawBody),
    },
    body: rawBody,
  });
}

describe('handleSlackEvent', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('SLACK_SIGNING_SECRET', 'test-signing-secret');
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await Promise.all(createdUserIds.map((id) => supabase.auth.admin.deleteUser(id)));
    createdUserIds.length = 0;
  });

  async function makeWorkspaceWithAccount(externalAccountId: string, teamId: string) {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Slack events test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Slack events test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `slack-events-${userId}@example.com`,
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
        external_account_id: externalAccountId,
        provider_team_id: teamId,
      })
      .select('id')
      .single()
      .throwOnError();

    return { workspaceId: workspace!.id as string, connectedAccountId: account!.id as string };
  }

  it('answers the url_verification handshake without touching the database', async () => {
    const request = makeRequest('test-signing-secret', {
      type: 'url_verification',
      challenge: 'abc123',
    });

    const response = await handleSlackEvent(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ challenge: 'abc123' });
  });

  it('rejects a request with an invalid signature', async () => {
    const rawBody = JSON.stringify({ type: 'url_verification', challenge: 'abc123' });
    const request = new Request('https://example.com/api/webhooks/slack/events', {
      method: 'POST',
      headers: {
        'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-slack-signature': 'v0=not-a-real-signature',
      },
      body: rawBody,
    });

    const response = await handleSlackEvent(request);
    expect(response.status).toBe(401);
  });

  it('ingests a channel message only for members who are actually in that channel', async () => {
    const { workspaceId, connectedAccountId: memberAccountId } = await makeWorkspaceWithAccount(
      'U_MEMBER',
      'T123',
    );
    const { connectedAccountId: nonMemberAccountId } = await makeWorkspaceWithAccount(
      'U_NON_MEMBER',
      'T123',
    );

    vi.spyOn(WebClient.prototype, 'apiCall').mockImplementation(async (method) => {
      if (method === 'conversations.members') {
        return { ok: true, members: ['U_MEMBER'] } as never;
      }
      throw new Error(`unexpected apiCall: ${method}`);
    });

    const request = makeRequest('test-signing-secret', {
      type: 'event_callback',
      team_id: 'T123',
      event: {
        type: 'message',
        channel: 'C111',
        channel_type: 'channel',
        user: 'U_SENDER',
        text: 'hello team',
        ts: '1700000000.000100',
      },
    });

    const response = await handleSlackEvent(request);
    expect(response.status).toBe(204);

    const { data: memberMessages } = await supabase
      .from('messages')
      .select('id')
      .eq('connected_account_id', memberAccountId)
      .throwOnError();
    expect(memberMessages).toHaveLength(1);

    const { data: nonMemberMessages } = await supabase
      .from('messages')
      .select('id')
      .eq('connected_account_id', nonMemberAccountId)
      .throwOnError();
    expect(nonMemberMessages).toHaveLength(0);

    void workspaceId;
  });

  it('ignores DM and group-DM channel types entirely, without calling the bot client', async () => {
    await makeWorkspaceWithAccount('U_MEMBER', 'T123');
    const apiCallSpy = vi.spyOn(WebClient.prototype, 'apiCall');

    const request = makeRequest('test-signing-secret', {
      type: 'event_callback',
      team_id: 'T123',
      event: {
        type: 'message',
        channel: 'D111',
        channel_type: 'im',
        user: 'U_SENDER',
        text: 'a dm',
        ts: '1700000000.000100',
      },
    });

    const response = await handleSlackEvent(request);
    expect(response.status).toBe(204);
    expect(apiCallSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when no connected account matches the event team_id', async () => {
    const request = makeRequest('test-signing-secret', {
      type: 'event_callback',
      team_id: 'T_UNKNOWN',
      event: {
        type: 'message',
        channel: 'C111',
        channel_type: 'channel',
        user: 'U_SENDER',
        text: 'hello',
        ts: '1700000000.000100',
      },
    });

    const response = await handleSlackEvent(request);
    expect(response.status).toBe(204);
  });
});
