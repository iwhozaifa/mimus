import { createServiceClient } from '@/src/db/service';
import { backfillGoogleAccount } from '@/src/server/connectors/google/backfill';
import { sleep } from '@/src/lib/sleep';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { calendar_v3, gmail_v1 } from 'googleapis';

// Rate-limit retries back off for real seconds; skip the wait in tests.
vi.mock('@/src/lib/sleep', () => ({ sleep: vi.fn(async () => {}) }));

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

  function threadsApi() {
    return Object.getPrototypeOf(
      google.gmail({ version: 'v1', auth: new google.auth.OAuth2() }).users.threads,
    );
  }

  function makeMessage(
    id: string,
    threadId: string,
    historyId = '100',
    subject = `Subject ${id}`,
  ): gmail_v1.Schema$Message {
    return {
      id,
      threadId,
      historyId,
      labelIds: ['INBOX'],
      internalDate: '1700000000000',
      payload: {
        headers: [
          { name: 'From', value: 'Jane Founder <jane@example.com>' },
          { name: 'Subject', value: subject },
        ],
      },
    };
  }

  async function storedMessageIds(connectedAccountId: string) {
    const { data } = await supabase
      .from('messages')
      .select('provider_message_id')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    return data!.map((m) => m.provider_message_id).sort();
  }

  it('backfills every message of each Gmail thread, idempotently', async () => {
    const { connectedAccountId } = await makeConnectedAccount('email');

    const thread: gmail_v1.Schema$Thread = {
      id: 'thread-1',
      historyId: '100',
      messages: [
        makeMessage('msg-1', 'thread-1', '90', 'Kickoff'),
        makeMessage('msg-2', 'thread-1'),
      ],
    };
    const listSpy = vi.spyOn(threadsApi(), 'list').mockResolvedValueOnce({
      data: { threads: [{ id: 'thread-1', historyId: '100' }] },
    } as never);
    const getSpy = vi.spyOn(threadsApi(), 'get').mockResolvedValueOnce({ data: thread } as never);

    await backfillGoogleAccount(connectedAccountId);

    expect(await storedMessageIds(connectedAccountId)).toEqual(['msg-1', 'msg-2']);
    expect(getSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', id: 'thread-1', format: 'full' }),
    );
    const { data: account } = await supabase
      .from('connected_accounts')
      .select('backfill_completed_at')
      .eq('id', connectedAccountId)
      .single()
      .throwOnError();
    expect(account!.backfill_completed_at).not.toBeNull();

    // Re-running with a changed thread (historyId advanced) re-fetches it
    // and must not duplicate rows (unique (connected_account_id,
    // provider_message_id) constraint from 2.3).
    listSpy.mockResolvedValueOnce({
      data: { threads: [{ id: 'thread-1', historyId: '200' }] },
    } as never);
    getSpy.mockResolvedValueOnce({ data: { ...thread, historyId: '200' } } as never);
    await backfillGoogleAccount(connectedAccountId);

    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(await storedMessageIds(connectedAccountId)).toEqual(['msg-1', 'msg-2']);
  });

  it('lists only the last 90 days and excludes spam, trash, promotions and social', async () => {
    const { connectedAccountId } = await makeConnectedAccount('email');
    const listSpy = vi
      .spyOn(threadsApi(), 'list')
      .mockResolvedValueOnce({ data: { threads: [] } } as never);

    await backfillGoogleAccount(connectedAccountId);

    const { q } = listSpy.mock.calls[0][0] as { q: string };
    const afterSeconds = Number(q.match(/after:(\d+)/)![1]);
    const ninetyDaysAgo = (Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000;
    expect(Math.abs(afterSeconds - ninetyDaysAgo)).toBeLessThan(60);
    for (const term of ['-in:spam', '-in:trash', '-category:promotions', '-category:social']) {
      expect(q.split(' ')).toContain(term);
    }
  });

  it('skips threads already imported and unchanged, so a resumed backfill spends no quota on them', async () => {
    const { connectedAccountId } = await makeConnectedAccount('email');

    vi.spyOn(threadsApi(), 'list')
      .mockResolvedValueOnce({
        data: { threads: [{ id: 'old-thread', historyId: '100' }] },
      } as never)
      .mockResolvedValueOnce({
        data: {
          threads: [
            { id: 'old-thread', historyId: '100' },
            { id: 'new-thread', historyId: '300' },
          ],
        },
      } as never);
    const getSpy = vi
      .spyOn(threadsApi(), 'get')
      .mockResolvedValueOnce({
        data: {
          id: 'old-thread',
          historyId: '100',
          messages: [makeMessage('old-1', 'old-thread')],
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          id: 'new-thread',
          historyId: '300',
          messages: [makeMessage('new-1', 'new-thread', '300')],
        },
      } as never);

    await backfillGoogleAccount(connectedAccountId);
    await backfillGoogleAccount(connectedAccountId);

    expect(getSpy.mock.calls.map(([params]) => (params as { id: string }).id)).toEqual([
      'old-thread',
      'new-thread',
    ]);
    expect(await storedMessageIds(connectedAccountId)).toEqual(['new-1', 'old-1']);
  });

  it('paginates through multiple pages of Gmail threads', async () => {
    const { connectedAccountId } = await makeConnectedAccount('email');

    vi.spyOn(threadsApi(), 'list')
      .mockResolvedValueOnce({
        data: { threads: [{ id: 'page1-thread', historyId: '1' }], nextPageToken: 'page-2' },
      } as never)
      .mockResolvedValueOnce({
        data: { threads: [{ id: 'page2-thread', historyId: '1' }] },
      } as never);
    vi.spyOn(threadsApi(), 'get')
      .mockResolvedValueOnce({
        data: { id: 'page1-thread', messages: [makeMessage('page1-msg', 'page1-thread')] },
      } as never)
      .mockResolvedValueOnce({
        data: { id: 'page2-thread', messages: [makeMessage('page2-msg', 'page2-thread')] },
      } as never);

    await backfillGoogleAccount(connectedAccountId);

    expect(await storedMessageIds(connectedAccountId)).toEqual(['page1-msg', 'page2-msg']);
  });

  it('paces Gmail calls against the per-user quota budget', async () => {
    const { connectedAccountId } = await makeConnectedAccount('email');
    vi.mocked(sleep).mockClear();

    vi.spyOn(threadsApi(), 'list').mockResolvedValueOnce({
      data: {
        threads: [
          { id: 't1', historyId: '1' },
          { id: 't2', historyId: '1' },
        ],
      },
    } as never);
    vi.spyOn(threadsApi(), 'get')
      .mockResolvedValueOnce({ data: { id: 't1', messages: [makeMessage('m1', 't1')] } } as never)
      .mockResolvedValueOnce({ data: { id: 't2', messages: [makeMessage('m2', 't2')] } } as never);

    await backfillGoogleAccount(connectedAccountId);

    // threads.list (10) then two threads.get (40 each) at the default 3,000
    // units/min (800ms per threads.get). The mocked sleep doesn't advance
    // the clock, so exact waits depend on DB latency -- QuotaPacer's own
    // unit tests pin the arithmetic; this only proves backfill is wired to it.
    const waits = vi.mocked(sleep).mock.calls.map(([ms]) => ms);
    expect(waits.length).toBeGreaterThanOrEqual(1);
    expect(waits.every((ms) => ms > 0 && ms <= 1000)).toBe(true);
  });

  it('retries past a Gmail per-user quota error instead of abandoning the backfill', async () => {
    const { connectedAccountId } = await makeConnectedAccount('email');

    vi.spyOn(threadsApi(), 'list').mockResolvedValueOnce({
      data: { threads: [{ id: 'quota-thread', historyId: '1' }] },
    } as never);
    vi.spyOn(threadsApi(), 'get')
      .mockRejectedValueOnce(
        Object.assign(new Error("Quota exceeded for quota metric 'Total Query Cost'"), {
          status: 403,
          response: {
            status: 403,
            data: { error: { errors: [{ reason: 'rateLimitExceeded' }] } },
          },
        }),
      )
      .mockResolvedValueOnce({
        data: { id: 'quota-thread', messages: [makeMessage('quota-msg', 'quota-thread')] },
      } as never);

    await backfillGoogleAccount(connectedAccountId);

    const { data: account } = await supabase
      .from('connected_accounts')
      .select('backfill_completed_at')
      .eq('id', connectedAccountId)
      .single()
      .throwOnError();
    expect(account!.backfill_completed_at).not.toBeNull();
    expect(await storedMessageIds(connectedAccountId)).toEqual(['quota-msg']);
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
});
