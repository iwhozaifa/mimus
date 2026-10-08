import { createServiceClient } from '@/src/db/service';
import { syncCalendlyAccount } from '@/src/server/connectors/calendly/sync';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('syncCalendlyAccount', () => {
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
      .insert({ name: 'Calendly sync test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Calendly sync test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `calendly-sync-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);

    const { data: account } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: workspace!.id,
        owner_user_id: userId,
        provider: 'calendly',
        account_type: 'scheduling',
        external_account_id: 'https://api.calendly.com/users/abc',
      })
      .select('id')
      .single()
      .throwOnError();

    const { ciphertext: encryptedAccessToken, keyVersion } = await encryptToken('access-123');
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

  // Routes Calendly API URLs to canned fixture responses; everything else
  // (the real local Supabase REST calls this module and the test's own
  // assertions make) passes through untouched, since supabase-js shares
  // this same global fetch.
  function mockCalendlyApi(handler: (url: URL) => unknown) {
    const realFetch = globalThis.fetch;
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname !== 'api.calendly.com') return realFetch(input, init);
      return new Response(JSON.stringify(handler(url)), { status: 200 });
    });
  }

  it('syncs events with their invitees, idempotently', async () => {
    const { connectedAccountId } = await makeConnectedAccount();

    mockCalendlyApi((url) => {
      if (url.pathname === '/scheduled_events') {
        return {
          collection: [
            {
              uri: 'https://api.calendly.com/scheduled_events/evt-1',
              name: '1:1 with Jane',
              status: 'active',
              start_time: '2024-03-15T15:00:00.000000Z',
              end_time: '2024-03-15T15:30:00.000000Z',
              event_memberships: [
                { user: 'https://api.calendly.com/users/abc', user_email: 'me@example.com' },
              ],
            },
          ],
          pagination: {},
        };
      }
      if (url.pathname === '/scheduled_events/evt-1/invitees') {
        return {
          collection: [
            {
              uri: 'https://api.calendly.com/scheduled_events/evt-1/invitees/inv-1',
              email: 'jane@example.com',
              name: 'Jane Doe',
              status: 'active',
            },
          ],
          pagination: {},
        };
      }
      throw new Error(`unexpected path: ${url.pathname}`);
    });

    await syncCalendlyAccount(connectedAccountId);

    const { data: events } = await supabase
      .from('events')
      .select('provider_event_id, title')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(events).toHaveLength(1);
    expect(events![0].title).toBe('1:1 with Jane');

    const { data: account } = await supabase
      .from('connected_accounts')
      .select('backfill_completed_at')
      .eq('id', connectedAccountId)
      .single()
      .throwOnError();
    expect(account!.backfill_completed_at).not.toBeNull();

    // Re-running must not duplicate the row.
    await syncCalendlyAccount(connectedAccountId);
    const { data: eventsAfterRerun } = await supabase
      .from('events')
      .select('id')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(eventsAfterRerun).toHaveLength(1);
  });

  it('paginates through multiple pages of events', async () => {
    const { connectedAccountId } = await makeConnectedAccount();

    mockCalendlyApi((url) => {
      if (url.pathname === '/scheduled_events') {
        if (!url.searchParams.get('page_token')) {
          return {
            collection: [
              {
                uri: 'https://api.calendly.com/scheduled_events/evt-page1',
                name: 'Page 1 meeting',
                start_time: '2024-03-15T15:00:00.000000Z',
                end_time: '2024-03-15T15:30:00.000000Z',
              },
            ],
            pagination: { next_page_token: 'page-2' },
          };
        }
        return {
          collection: [
            {
              uri: 'https://api.calendly.com/scheduled_events/evt-page2',
              name: 'Page 2 meeting',
              start_time: '2024-03-16T15:00:00.000000Z',
              end_time: '2024-03-16T15:30:00.000000Z',
            },
          ],
          pagination: {},
        };
      }
      return { collection: [], pagination: {} };
    });

    await syncCalendlyAccount(connectedAccountId);

    const { data: events } = await supabase
      .from('events')
      .select('title')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(events!.map((e) => e.title).sort()).toEqual(['Page 1 meeting', 'Page 2 meeting']);
  });

  it('never makes an outbound write call to Calendly -- every request is a plain GET', async () => {
    const { connectedAccountId } = await makeConnectedAccount();

    const fetchSpy = mockCalendlyApi((url) => {
      if (url.pathname === '/scheduled_events') {
        return {
          collection: [
            {
              uri: 'https://api.calendly.com/scheduled_events/evt-1',
              name: 'Meeting',
              start_time: '2024-03-15T15:00:00.000000Z',
              end_time: '2024-03-15T15:30:00.000000Z',
            },
          ],
          pagination: {},
        };
      }
      return { collection: [], pagination: {} };
    });

    await syncCalendlyAccount(connectedAccountId);

    const calendlyCalls = fetchSpy.mock.calls.filter(([input]) =>
      String(input).includes('api.calendly.com'),
    );
    expect(calendlyCalls.length).toBeGreaterThan(0);
    for (const [, init] of calendlyCalls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const method = (init as any)?.method;
      expect(method === undefined || method === 'GET').toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((init as any)?.body).toBeUndefined();
    }
  });
});
