import { createServiceClient } from '@/src/db/service';
import { createCalendarEvent, sendReply } from '@/src/server/connectors/write';
import { upsertMessage } from '@/src/server/shared/normalize';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Client } from '@microsoft/microsoft-graph-client';

vi.mock('@/src/server/connectors/microsoft/client', () => ({
  getAuthorizedGraphClient: vi.fn(),
}));

import { getAuthorizedGraphClient } from '@/src/server/connectors/microsoft/client';

function fakeGraph(responses: Record<string, unknown>) {
  const posts: Array<{ path: string; body: unknown }> = [];
  const client = {
    api: (path: string) => ({
      post: async (body: unknown) => {
        posts.push({ path, body });
        return responses[path];
      },
    }),
  } as unknown as Client;
  return { client, posts };
}

describe('Microsoft sending and booking (real local Supabase, Graph mocked)', () => {
  const service = createServiceClient();
  const userId = randomUUID();
  let companyId: string;
  let emailAccount: string;
  let calendarAccount: string;
  let messageId: string;

  beforeAll(async () => {
    await service.auth.admin.createUser({
      id: userId,
      email: `${userId}@example.com`,
      email_confirm: true,
    });
    const { data: company } = await service
      .from('companies')
      .insert({ name: 'MS write co' })
      .select('id')
      .single()
      .throwOnError();
    companyId = company!.id;
    const { data: workspace } = await service
      .from('workspaces')
      .insert({ company_id: companyId, name: 'MS write ws' })
      .select('id')
      .single()
      .throwOnError();
    const account = async (accountType: string) => {
      const { data } = await service
        .from('connected_accounts')
        .insert({
          workspace_id: workspace!.id,
          owner_user_id: userId,
          provider: 'microsoft',
          account_type: accountType,
          external_account_id: 'founder@example.com',
          scopes: ['Mail.Read', 'Calendars.Read', 'Mail.Send', 'Calendars.ReadWrite'],
        })
        .select('id')
        .single()
        .throwOnError();
      return data!.id as string;
    };
    emailAccount = await account('email');
    calendarAccount = await account('calendar');
    messageId = await upsertMessage(workspace!.id, emailAccount, {
      providerMessageId: 'AAMk-1',
      subject: 'Meet?',
      direction: 'inbound',
      sentAt: '2026-10-12T10:00:00Z',
    });
  });

  afterAll(async () => {
    await service.from('companies').delete().eq('id', companyId);
    await service.auth.admin.deleteUser(userId);
  });

  it('replies on the original Outlook message, asking for the send scope', async () => {
    const { client, posts } = fakeGraph({});
    vi.mocked(getAuthorizedGraphClient).mockResolvedValue(client);

    await sendReply(emailAccount, {
      sourceMessageId: messageId,
      to: ['sam@client.example'],
      subject: 'Re: Meet?',
      body: 'Tuesday works.',
    });

    expect(getAuthorizedGraphClient).toHaveBeenLastCalledWith(
      emailAccount,
      expect.arrayContaining(['Mail.Send']),
    );
    expect(posts).toEqual([
      {
        path: '/me/messages/AAMk-1/reply',
        body: {
          message: { toRecipients: [{ emailAddress: { address: 'sam@client.example' } }] },
          comment: 'Tuesday works.',
        },
      },
    ]);
  });

  it('creates an Outlook event with the attendee invited and a Teams link', async () => {
    const { client, posts } = fakeGraph({
      '/me/events': {
        id: 'ms-evt-1',
        subject: 'Founder <> Sam',
        start: { dateTime: '2026-10-20T10:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2026-10-20T10:30:00.0000000', timeZone: 'UTC' },
      },
    });
    vi.mocked(getAuthorizedGraphClient).mockResolvedValue(client);

    const result = await createCalendarEvent(calendarAccount, {
      title: 'Founder <> Sam',
      start: '2026-10-20T10:00:00.000Z',
      end: '2026-10-20T10:30:00.000Z',
      attendees: ['sam@client.example'],
      videoLink: true,
    });

    expect(result).toEqual({ providerEventId: 'ms-evt-1' });
    expect(posts[0].body).toMatchObject({
      subject: 'Founder <> Sam',
      start: { dateTime: '2026-10-20T10:00:00.000', timeZone: 'UTC' },
      end: { dateTime: '2026-10-20T10:30:00.000', timeZone: 'UTC' },
      attendees: [{ emailAddress: { address: 'sam@client.example' }, type: 'required' }],
      isOnlineMeeting: true,
    });
    const { count } = await service
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('provider_event_id', 'ms-evt-1');
    expect(count).toBe(1);
  });
});
