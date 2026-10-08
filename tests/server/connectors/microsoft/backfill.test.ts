import { createServiceClient } from '@/src/db/service';
import { backfillMicrosoftAccount } from '@/src/server/connectors/microsoft/backfill';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@microsoft/microsoft-graph-client';
import type { Event, Message } from '@microsoft/microsoft-graph-types';

// The Graph JS SDK's Client ultimately drives a real fetch through its own
// middleware chain -- there's no prototype-level network seam to spy on the
// way googleapis' SDK has, so the connector's own client-builder function
// is mocked instead (the same seam connect.test.ts already mocks
// microsoft/oauth's exchangeCode through).
vi.mock('@/src/server/connectors/microsoft/client', () => ({
  getAuthorizedGraphClient: vi.fn(),
}));

import { getAuthorizedGraphClient } from '@/src/server/connectors/microsoft/client';

interface FakePage<T> {
  value: T[];
  nextLink?: string;
}

function fakeGraphClient(responsesByPath: Record<string, FakePage<unknown>>): Client {
  const api = vi.fn((path: string) => {
    const chain = {
      filter: () => chain,
      top: () => chain,
      header: () => chain,
      query: () => chain,
      get: async () => {
        const page = responsesByPath[path];
        if (!page) throw new Error(`fakeGraphClient: no response configured for "${path}"`);
        return { value: page.value, '@odata.nextLink': page.nextLink };
      },
    };
    return chain;
  });
  return { api } as unknown as Client;
}

describe('backfillMicrosoftAccount', () => {
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

  async function makeConnectedAccount(accountType: 'email' | 'calendar') {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'MS backfill test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'MS backfill test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `ms-backfill-${userId}@example.com`,
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
        external_account_id: 'founder@example.com',
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

    return { connectedAccountId: account!.id as string };
  }

  it('backfills messages for an email account, idempotently', async () => {
    const { connectedAccountId } = await makeConnectedAccount('email');

    const fixtureMessage: Message = {
      id: 'msg-backfill-1',
      conversationId: 'thread-1',
      subject: 'Backfilled message',
      from: { emailAddress: { address: 'jane@example.com' } },
    };

    vi.mocked(getAuthorizedGraphClient).mockResolvedValue(
      fakeGraphClient({ '/me/messages': { value: [fixtureMessage] } }),
    );

    await backfillMicrosoftAccount(connectedAccountId);

    const { data: messages } = await supabase
      .from('messages')
      .select('provider_message_id, subject')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(messages).toHaveLength(1);
    expect(messages![0].subject).toBe('Backfilled message');

    const { data: account } = await supabase
      .from('connected_accounts')
      .select('backfill_completed_at')
      .eq('id', connectedAccountId)
      .single()
      .throwOnError();
    expect(account!.backfill_completed_at).not.toBeNull();

    // Re-running must not duplicate the row (idempotency via the unique
    // (connected_account_id, provider_message_id) constraint from 2.3).
    await backfillMicrosoftAccount(connectedAccountId);

    const { data: messagesAfterRerun } = await supabase
      .from('messages')
      .select('id')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(messagesAfterRerun).toHaveLength(1);
  });

  it('backfills events for a calendar account, idempotently', async () => {
    const { connectedAccountId } = await makeConnectedAccount('calendar');

    const fixtureEvent: Event = {
      id: 'event-backfill-1',
      subject: 'Backfilled meeting',
      start: { dateTime: '2024-03-15T15:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2024-03-15T16:00:00.0000000', timeZone: 'UTC' },
    };

    vi.mocked(getAuthorizedGraphClient).mockResolvedValue(
      fakeGraphClient({ '/me/calendarView': { value: [fixtureEvent] } }),
    );

    await backfillMicrosoftAccount(connectedAccountId);

    const { data: events } = await supabase
      .from('events')
      .select('provider_event_id, title')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(events).toHaveLength(1);
    expect(events![0].title).toBe('Backfilled meeting');

    await backfillMicrosoftAccount(connectedAccountId);

    const { data: eventsAfterRerun } = await supabase
      .from('events')
      .select('id')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(eventsAfterRerun).toHaveLength(1);
  });

  it('paginates through multiple pages of message results', async () => {
    const { connectedAccountId } = await makeConnectedAccount('email');

    const makeFixture = (id: string): Message => ({
      id,
      from: { emailAddress: { address: 'jane@example.com' } },
    });

    const nextLink = 'https://graph.microsoft.com/v1.0/me/messages?$skip=50';
    vi.mocked(getAuthorizedGraphClient).mockResolvedValue(
      fakeGraphClient({
        '/me/messages': { value: [makeFixture('page1-msg')], nextLink },
        [nextLink]: { value: [makeFixture('page2-msg')] },
      }),
    );

    await backfillMicrosoftAccount(connectedAccountId);

    const { data: messages } = await supabase
      .from('messages')
      .select('provider_message_id')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(messages!.map((m) => m.provider_message_id).sort()).toEqual(['page1-msg', 'page2-msg']);
  });
});
