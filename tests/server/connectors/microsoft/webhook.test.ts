import { createServiceClient } from '@/src/db/service';
import {
  handleGraphNotifications,
  handleGraphValidation,
  handleMicrosoftGraphWebhook,
  registerGraphSubscription,
  renewGraphSubscriptionsIfNeeded,
  verifyClientState,
} from '@/src/server/connectors/microsoft/webhook';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@microsoft/microsoft-graph-client';
import type { Message } from '@microsoft/microsoft-graph-types';

// Same fake-client seam backfill.test.ts uses -- the Graph SDK's Client has
// no prototype-level network call to spy on, so the connector's own
// client-builder function is mocked instead.
vi.mock('@/src/server/connectors/microsoft/client', () => ({
  getAuthorizedGraphClient: vi.fn(),
}));

import { getAuthorizedGraphClient } from '@/src/server/connectors/microsoft/client';

interface FakeResponse {
  value?: unknown[];
  nextLink?: string;
  deltaLink?: string;
}

function fakeGraphClient(
  responsesByPath: Record<string, FakeResponse>,
  postResult?: { id: string },
): Client {
  const api = vi.fn((path: string) => {
    const chain = {
      header: () => chain,
      query: () => chain,
      get: async () => {
        const page = responsesByPath[path];
        if (!page) throw new Error(`fakeGraphClient: no response configured for "${path}"`);
        return {
          value: page.value,
          '@odata.nextLink': page.nextLink,
          '@odata.deltaLink': page.deltaLink,
        };
      },
      post: async () => {
        if (!postResult) throw new Error('fakeGraphClient: no postResult configured');
        return postResult;
      },
      patch: async () => ({}),
    };
    return chain;
  });
  return { api } as unknown as Client;
}

describe('microsoft webhook', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.stubEnv('MICROSOFT_GRAPH_CLIENT_STATE', 'test-client-state-secret');
    vi.stubEnv(
      'MICROSOFT_GRAPH_NOTIFICATION_URL',
      'https://app.example.com/api/webhooks/microsoft/graph',
    );
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await Promise.all(createdUserIds.map((id) => supabase.auth.admin.deleteUser(id)));
    createdUserIds.length = 0;
  });

  async function makeConnectedAccount(
    accountType: 'email' | 'calendar',
    externalAccountId = 'founder@example.com',
  ) {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'MS webhook test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'MS webhook test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `ms-webhook-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);

    const { data: account } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: workspace!.id,
        owner_user_id: userId,
        provider: 'microsoft',
        account_type: accountType,
        external_account_id: externalAccountId,
      })
      .select('id')
      .single()
      .throwOnError();

    const { ciphertext, keyVersion } = await encryptToken('serialized-cache-blob');
    await supabase
      .from('connected_account_secrets')
      .insert({
        connected_account_id: account!.id,
        encrypted_refresh_token: bufferToPgBytea(ciphertext),
        key_version: keyVersion,
      })
      .throwOnError();

    return { connectedAccountId: account!.id as string, workspaceId: workspace!.id as string };
  }

  describe('handleGraphValidation', () => {
    it('echoes the validation token back as text/plain, status 200', () => {
      const response = handleGraphValidation('token-abc');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/plain');
    });
  });

  describe('verifyClientState', () => {
    it('throws when the received clientState does not match', () => {
      expect(() => verifyClientState('wrong-secret')).toThrow(/did not match/i);
    });

    it('passes when the received clientState matches', () => {
      expect(() => verifyClientState('test-client-state-secret')).not.toThrow();
    });

    it('throws a clear error when MICROSOFT_GRAPH_CLIENT_STATE is unset', () => {
      vi.unstubAllEnvs();
      expect(() => verifyClientState('anything')).toThrow(/not configured/);
    });
  });

  describe('handleGraphNotifications', () => {
    it('syncs the matching account via delta query and stores the deltaLink', async () => {
      const { connectedAccountId } = await makeConnectedAccount('email');
      await supabase
        .from('connected_accounts')
        .update({ watch_channel_id: 'sub-123' })
        .eq('id', connectedAccountId)
        .throwOnError();

      const fixtureMessage: Message = {
        id: 'msg-notif-1',
        subject: 'New via webhook',
        from: { emailAddress: { address: 'jane@example.com' } },
      };

      vi.mocked(getAuthorizedGraphClient).mockResolvedValue(
        fakeGraphClient({
          "/me/mailFolders('inbox')/messages/delta": {
            value: [fixtureMessage],
            deltaLink:
              "https://graph.microsoft.com/v1.0/me/mailFolders('inbox')/messages/delta?$deltatoken=abc",
          },
        }),
      );

      await handleGraphNotifications([
        {
          subscriptionId: 'sub-123',
          clientState: 'test-client-state-secret',
          resource: '/me/messages',
          changeType: 'created',
        },
      ]);

      const { data: messages } = await supabase
        .from('messages')
        .select('provider_message_id, subject')
        .eq('connected_account_id', connectedAccountId)
        .throwOnError();
      expect(messages).toHaveLength(1);
      expect(messages![0].subject).toBe('New via webhook');

      const { data: account } = await supabase
        .from('connected_accounts')
        .select('sync_cursor')
        .eq('id', connectedAccountId)
        .single()
        .throwOnError();
      expect(account!.sync_cursor).toContain('deltatoken=abc');
    });

    it('rejects a notification with a mismatched clientState before touching the DB', async () => {
      await expect(
        handleGraphNotifications([
          {
            subscriptionId: 'sub-999',
            clientState: 'wrong',
            resource: '/me/messages',
            changeType: 'created',
          },
        ]),
      ).rejects.toThrow(/did not match/i);
    });

    it('is a no-op when no connected account matches the subscriptionId', async () => {
      await expect(
        handleGraphNotifications([
          {
            subscriptionId: 'unknown-sub',
            clientState: 'test-client-state-secret',
            resource: '/me/messages',
            changeType: 'created',
          },
        ]),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleMicrosoftGraphWebhook', () => {
    it('answers the validation handshake without reading a body', async () => {
      const request = new Request(
        'https://app.example.com/api/webhooks/microsoft/graph?validationToken=handshake-token',
        { method: 'POST' },
      );
      const response = await handleMicrosoftGraphWebhook(request);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('handshake-token');
    });

    it('processes notifications and returns 202', async () => {
      const { connectedAccountId } = await makeConnectedAccount('calendar');
      await supabase
        .from('connected_accounts')
        .update({ watch_channel_id: 'sub-cal-1' })
        .eq('id', connectedAccountId)
        .throwOnError();

      vi.mocked(getAuthorizedGraphClient).mockResolvedValue(
        fakeGraphClient({
          '/me/calendarView/delta': {
            value: [
              {
                id: 'event-notif-1',
                subject: 'Notified meeting',
                start: { dateTime: '2024-03-15T15:00:00.0000000', timeZone: 'UTC' },
                end: { dateTime: '2024-03-15T16:00:00.0000000', timeZone: 'UTC' },
              },
            ],
            deltaLink: 'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=xyz',
          },
        }),
      );

      const request = new Request('https://app.example.com/api/webhooks/microsoft/graph', {
        method: 'POST',
        body: JSON.stringify({
          value: [
            {
              subscriptionId: 'sub-cal-1',
              clientState: 'test-client-state-secret',
              resource: '/me/events',
              changeType: 'created',
            },
          ],
        }),
      });

      const response = await handleMicrosoftGraphWebhook(request);
      expect(response.status).toBe(202);

      const { data: events } = await supabase
        .from('events')
        .select('title')
        .eq('connected_account_id', connectedAccountId)
        .throwOnError();
      expect(events).toHaveLength(1);
      expect(events![0].title).toBe('Notified meeting');
    });
  });

  describe('registerGraphSubscription / renewGraphSubscriptionsIfNeeded', () => {
    it('registers a subscription for an email account against /me/messages', async () => {
      const { connectedAccountId } = await makeConnectedAccount('email');
      vi.mocked(getAuthorizedGraphClient).mockResolvedValue(
        fakeGraphClient({}, { id: 'sub-new-1' }),
      );

      await registerGraphSubscription(connectedAccountId);

      const { data: account } = await supabase
        .from('connected_accounts')
        .select('watch_channel_id, watch_resource_id, watch_expires_at')
        .eq('id', connectedAccountId)
        .single()
        .throwOnError();
      expect(account!.watch_channel_id).toBe('sub-new-1');
      expect(account!.watch_resource_id).toBe('/me/messages');
      expect(account!.watch_expires_at).not.toBeNull();
    });

    it('registers a subscription for a calendar account against /me/events', async () => {
      const { connectedAccountId } = await makeConnectedAccount('calendar');
      vi.mocked(getAuthorizedGraphClient).mockResolvedValue(
        fakeGraphClient({}, { id: 'sub-new-2' }),
      );

      await registerGraphSubscription(connectedAccountId);

      const { data: account } = await supabase
        .from('connected_accounts')
        .select('watch_resource_id')
        .eq('id', connectedAccountId)
        .single()
        .throwOnError();
      expect(account!.watch_resource_id).toBe('/me/events');
    });

    it('throws a clear error when the notification URL/clientState are unset', async () => {
      vi.unstubAllEnvs();
      vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
      const { connectedAccountId } = await makeConnectedAccount('email');
      await expect(registerGraphSubscription(connectedAccountId)).rejects.toThrow(/not configured/);
    });

    it('renews only subscriptions due within the buffer window', async () => {
      const { connectedAccountId: dueAccountId } = await makeConnectedAccount(
        'email',
        'due@example.com',
      );
      const { connectedAccountId: freshAccountId } = await makeConnectedAccount(
        'email',
        'fresh@example.com',
      );

      await supabase
        .from('connected_accounts')
        .update({
          watch_channel_id: 'sub-due',
          watch_expires_at: new Date(Date.now() - 1000).toISOString(),
        })
        .eq('id', dueAccountId)
        .throwOnError();
      await supabase
        .from('connected_accounts')
        .update({
          watch_channel_id: 'sub-fresh',
          watch_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString(),
        })
        .eq('id', freshAccountId)
        .throwOnError();

      const patch = vi.fn(async () => ({}));
      const api = vi.fn(() => ({ patch }));
      vi.mocked(getAuthorizedGraphClient).mockResolvedValue({ api } as unknown as Client);

      const result = await renewGraphSubscriptionsIfNeeded();

      expect(result.renewed).toContain(dueAccountId);
      expect(result.renewed).not.toContain(freshAccountId);
      expect(api).toHaveBeenCalledWith('/subscriptions/sub-due');
      expect(api).toHaveBeenCalledTimes(1);
    });

    it('falls back to registering a fresh subscription when renewing a lapsed one fails', async () => {
      const { connectedAccountId } = await makeConnectedAccount('email', 'lapsed@example.com');
      await supabase
        .from('connected_accounts')
        .update({
          watch_channel_id: 'sub-gone',
          watch_expires_at: new Date(Date.now() - 1000).toISOString(),
        })
        .eq('id', connectedAccountId)
        .throwOnError();

      const patch = vi.fn(async () => {
        throw new Error('404 subscription not found');
      });
      const post = vi.fn(async () => ({ id: 'sub-replacement' }));
      const api = vi.fn(() => ({ patch, post }));
      vi.mocked(getAuthorizedGraphClient).mockResolvedValue({ api } as unknown as Client);

      const result = await renewGraphSubscriptionsIfNeeded();

      expect(result.renewed).toContain(connectedAccountId);
      const { data: account } = await supabase
        .from('connected_accounts')
        .select('watch_channel_id')
        .eq('id', connectedAccountId)
        .single()
        .throwOnError();
      expect(account!.watch_channel_id).toBe('sub-replacement');
    });
  });
});
