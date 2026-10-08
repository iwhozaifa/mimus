import { createServiceClient } from '@/src/db/service';
import { backfillSlackAccount } from '@/src/server/connectors/slack/backfill';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { WebClient } from '@slack/web-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('backfillSlackAccount', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
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
      .insert({ name: 'Slack backfill test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Slack backfill test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `slack-backfill-${userId}@example.com`,
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

    return { connectedAccountId: account!.id as string };
  }

  it('backfills history only for channels the member is a member of, idempotently', async () => {
    const { connectedAccountId } = await makeConnectedAccount();

    vi.spyOn(WebClient.prototype, 'apiCall').mockImplementation(async (method) => {
      if (method === 'users.conversations') {
        return { ok: true, channels: [{ id: 'C111' }] } as never;
      }
      if (method === 'conversations.history') {
        return {
          ok: true,
          messages: [{ ts: '1700000000.000100', text: 'hello team', user: 'U456' }],
        } as never;
      }
      throw new Error(`unexpected apiCall: ${method}`);
    });

    await backfillSlackAccount(connectedAccountId);

    const { data: messages } = await supabase
      .from('messages')
      .select('provider_message_id, body_text')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(messages).toHaveLength(1);
    expect(messages![0].provider_message_id).toBe('C111:1700000000.000100');
    expect(messages![0].body_text).toBe('hello team');

    const { data: account } = await supabase
      .from('connected_accounts')
      .select('backfill_completed_at')
      .eq('id', connectedAccountId)
      .single()
      .throwOnError();
    expect(account!.backfill_completed_at).not.toBeNull();

    // Re-running must not duplicate the row (idempotency via the unique
    // (connected_account_id, provider_message_id) constraint).
    await backfillSlackAccount(connectedAccountId);
    const { data: messagesAfterRerun } = await supabase
      .from('messages')
      .select('id')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(messagesAfterRerun).toHaveLength(1);
  });

  it('only requests public_channel/private_channel types -- never im/mpim', async () => {
    const { connectedAccountId } = await makeConnectedAccount();

    const spy = vi.spyOn(WebClient.prototype, 'apiCall').mockImplementation(async (method) => {
      if (method === 'users.conversations') {
        return { ok: true, channels: [] } as never;
      }
      throw new Error(`unexpected apiCall: ${method}`);
    });

    await backfillSlackAccount(connectedAccountId);

    const [, options] = spy.mock.calls.find(([method]) => method === 'users.conversations')!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const types = (options as any).types as string;
    expect(types).toContain('public_channel');
    expect(types).toContain('private_channel');
    expect(types).not.toContain('im');
    expect(types).not.toContain('mpim');
  });

  it('paginates through multiple pages of channels and of history within a channel', async () => {
    const { connectedAccountId } = await makeConnectedAccount();

    vi.spyOn(WebClient.prototype, 'apiCall').mockImplementation(async (method, options) => {
      if (method === 'users.conversations') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cursor = (options as any)?.cursor;
        if (!cursor) {
          return {
            ok: true,
            channels: [{ id: 'C111' }],
            response_metadata: { next_cursor: 'page-2' },
          } as never;
        }
        return { ok: true, channels: [{ id: 'C222' }] } as never;
      }
      if (method === 'conversations.history') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = (options as any)?.channel;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cursor = (options as any)?.cursor;
        if (channel === 'C111' && !cursor) {
          return {
            ok: true,
            messages: [{ ts: '1700000000.000100', text: 'c111 page1', user: 'U1' }],
            has_more: true,
            response_metadata: { next_cursor: 'hist-page-2' },
          } as never;
        }
        if (channel === 'C111' && cursor === 'hist-page-2') {
          return {
            ok: true,
            messages: [{ ts: '1700000001.000100', text: 'c111 page2', user: 'U1' }],
          } as never;
        }
        if (channel === 'C222') {
          return {
            ok: true,
            messages: [{ ts: '1700000002.000100', text: 'c222 msg', user: 'U2' }],
          } as never;
        }
      }
      throw new Error(`unexpected apiCall: ${method} ${JSON.stringify(options)}`);
    });

    await backfillSlackAccount(connectedAccountId);

    const { data: messages } = await supabase
      .from('messages')
      .select('body_text')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(messages!.map((m) => m.body_text).sort()).toEqual([
      'c111 page1',
      'c111 page2',
      'c222 msg',
    ]);
  });
});
