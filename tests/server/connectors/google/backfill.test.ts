import { createServiceClient } from '@/src/db/service';
import { backfillGoogleAccount } from '@/src/server/connectors/google/backfill';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { calendar_v3, gmail_v1 } from 'googleapis';

describe('backfillGoogleAccount', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('GOOGLE_OAUTH_REDIRECT_URI', 'http://localhost:3000/api/connectors/google/callback');
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
      .insert({ name: 'Backfill test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Backfill test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `backfill-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);

    const { data: account } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: workspace!.id,
        owner_user_id: userId,
        provider: 'google',
        account_type: accountType,
        external_account_id: 'founder@example.com',
      })
      .select('id')
      .single()
      .throwOnError();

    const { ciphertext: encryptedAccessToken, keyVersion } = await encryptToken('access-123');
    const { ciphertext: encryptedRefreshToken } = await encryptToken('refresh-123');
    await supabase
      .from('connected_account_secrets')
      .insert({
        connected_account_id: account!.id,
        encrypted_access_token: bufferToPgBytea(encryptedAccessToken),
        encrypted_refresh_token: bufferToPgBytea(encryptedRefreshToken),
        key_version: keyVersion,
      })
      .throwOnError();

    return { connectedAccountId: account!.id as string, workspaceId: workspace!.id as string };
  }

  it('backfills Gmail messages for an email account, idempotently', async () => {
    const { connectedAccountId } = await makeConnectedAccount('email');

    const fixtureMessage: gmail_v1.Schema$Message = {
      id: 'msg-backfill-1',
      threadId: 'thread-1',
      labelIds: ['INBOX'],
      internalDate: '1700000000000',
      payload: {
        headers: [
          { name: 'From', value: 'Jane Founder <jane@example.com>' },
          { name: 'Subject', value: 'Backfilled message' },
        ],
      },
    };

    const messagesListPrototype = Object.getPrototypeOf(
      google.gmail({ version: 'v1', auth: new google.auth.OAuth2() }).users.messages,
    );
    const listSpy = vi
      .spyOn(messagesListPrototype, 'list')
      .mockResolvedValueOnce({ data: { messages: [{ id: 'msg-backfill-1' }] } } as never);
    const getSpy = vi
      .spyOn(messagesListPrototype, 'get')
      .mockResolvedValueOnce({ data: fixtureMessage } as never);

    await backfillGoogleAccount(connectedAccountId);

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
    listSpy.mockResolvedValueOnce({ data: { messages: [{ id: 'msg-backfill-1' }] } } as never);
    getSpy.mockResolvedValueOnce({ data: fixtureMessage } as never);
    await backfillGoogleAccount(connectedAccountId);

    const { data: messagesAfterRerun } = await supabase
      .from('messages')
      .select('id')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(messagesAfterRerun).toHaveLength(1);
  });

  it('backfills Calendar events for a calendar account, idempotently', async () => {
    const { connectedAccountId } = await makeConnectedAccount('calendar');

    const fixtureEvent: calendar_v3.Schema$Event = {
      id: 'event-backfill-1',
      summary: 'Backfilled meeting',
      start: { dateTime: '2024-03-15T15:00:00Z' },
      end: { dateTime: '2024-03-15T16:00:00Z' },
    };

    const eventsListPrototype = Object.getPrototypeOf(
      google.calendar({ version: 'v3', auth: new google.auth.OAuth2() }).events,
    );
    const listSpy = vi
      .spyOn(eventsListPrototype, 'list')
      .mockResolvedValueOnce({ data: { items: [fixtureEvent] } } as never);

    await backfillGoogleAccount(connectedAccountId);

    const { data: events } = await supabase
      .from('events')
      .select('provider_event_id, title')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(events).toHaveLength(1);
    expect(events![0].title).toBe('Backfilled meeting');

    listSpy.mockResolvedValueOnce({ data: { items: [fixtureEvent] } } as never);
    await backfillGoogleAccount(connectedAccountId);

    const { data: eventsAfterRerun } = await supabase
      .from('events')
      .select('id')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(eventsAfterRerun).toHaveLength(1);
  });

  it('paginates through multiple pages of Gmail results', async () => {
    const { connectedAccountId } = await makeConnectedAccount('email');

    const makeFixture = (id: string): gmail_v1.Schema$Message => ({
      id,
      labelIds: ['INBOX'],
      internalDate: '1700000000000',
      payload: { headers: [{ name: 'From', value: 'jane@example.com' }] },
    });

    const messagesListPrototype = Object.getPrototypeOf(
      google.gmail({ version: 'v1', auth: new google.auth.OAuth2() }).users.messages,
    );
    vi.spyOn(messagesListPrototype, 'list')
      .mockResolvedValueOnce({
        data: { messages: [{ id: 'page1-msg' }], nextPageToken: 'page-2' },
      } as never)
      .mockResolvedValueOnce({ data: { messages: [{ id: 'page2-msg' }] } } as never);
    vi.spyOn(messagesListPrototype, 'get')
      .mockResolvedValueOnce({ data: makeFixture('page1-msg') } as never)
      .mockResolvedValueOnce({ data: makeFixture('page2-msg') } as never);

    await backfillGoogleAccount(connectedAccountId);

    const { data: messages } = await supabase
      .from('messages')
      .select('provider_message_id')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(messages!.map((m) => m.provider_message_id).sort()).toEqual(['page1-msg', 'page2-msg']);
  });
});
