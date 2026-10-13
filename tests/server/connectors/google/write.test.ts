import { createServiceClient } from '@/src/db/service';
import { createCalendarEvent, sendReply, WriteAccessError } from '@/src/server/connectors/write';
import { upsertMessage } from '@/src/server/shared/normalize';
import { google } from 'googleapis';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/server/connectors/google/client', () => ({
  getAuthorizedClient: vi.fn(async () => new google.auth.OAuth2()),
}));

const auth = new google.auth.OAuth2();
const messagesApi = Object.getPrototypeOf(google.gmail({ version: 'v1', auth }).users.messages);
const eventsApi = Object.getPrototypeOf(google.calendar({ version: 'v3', auth }).events);

const READ = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];
const WRITE = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
];

function decodeRaw(raw: string) {
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  const [head, body] = mime.split('\r\n\r\n');
  return { head, body: Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8') };
}

describe('Google sending and booking (real local Supabase, Google APIs mocked)', () => {
  const service = createServiceClient();
  const userId = randomUUID();
  let companyId: string;
  let workspaceId: string;
  let emailAccount: string;
  let calendarAccount: string;
  let readOnlyEmailAccount: string;
  let messageId: string;

  beforeAll(async () => {
    await service.auth.admin.createUser({
      id: userId,
      email: `${userId}@example.com`,
      email_confirm: true,
    });
    const { data: company } = await service
      .from('companies')
      .insert({ name: 'Write co' })
      .select('id')
      .single()
      .throwOnError();
    companyId = company!.id;
    const { data: workspace } = await service
      .from('workspaces')
      .insert({ company_id: companyId, name: 'Write ws' })
      .select('id')
      .single()
      .throwOnError();
    workspaceId = workspace!.id;
    await service
      .from('workspace_members')
      .insert({ workspace_id: workspaceId, user_id: userId, role: 'owner' })
      .throwOnError();

    const account = async (accountType: string, scopes: string[], email: string) => {
      const { data } = await service
        .from('connected_accounts')
        .insert({
          workspace_id: workspaceId,
          owner_user_id: userId,
          provider: 'google',
          account_type: accountType,
          external_account_id: email,
          scopes,
        })
        .select('id')
        .single()
        .throwOnError();
      return data!.id as string;
    };
    emailAccount = await account('email', [...READ, ...WRITE], 'founder@example.com');
    calendarAccount = await account('calendar', [...READ, ...WRITE], 'founder@example.com');
    readOnlyEmailAccount = await account('email', READ, 'other@example.com');

    messageId = await upsertMessage(workspaceId, emailAccount, {
      providerMessageId: 'gmail-1',
      threadId: 'thread-1',
      subject: 'Can we meet next week?',
      direction: 'inbound',
      sentAt: '2026-10-12T10:00:00Z',
      raw: {
        payload: {
          headers: [
            { name: 'Message-Id', value: '<abc@mail.example.com>' },
            { name: 'References', value: '<root@mail.example.com>' },
          ],
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await service.from('companies').delete().eq('id', companyId);
    await service.auth.admin.deleteUser(userId);
  });

  it('sends a threaded plain-text reply from the account that received the message', async () => {
    const send = vi
      .spyOn(messagesApi, 'send')
      .mockResolvedValue({ data: { id: 'sent-1' } } as never);

    const result = await sendReply(emailAccount, {
      sourceMessageId: messageId,
      to: ['sam@client.example'],
      subject: 'Re: Can we meet next week? — café',
      body: 'Hi Sam,\n\nTuesday works — 10:00?\n',
    });

    expect(result).toEqual({ providerMessageId: 'sent-1' });
    const request = send.mock.calls[0][0] as {
      userId: string;
      requestBody: { raw: string; threadId: string };
    };
    expect(request.userId).toBe('me');
    expect(request.requestBody.threadId).toBe('thread-1');
    const { head, body } = decodeRaw(request.requestBody.raw);
    expect(head).toContain('From: founder@example.com');
    expect(head).toContain('To: sam@client.example');
    expect(head).toContain('In-Reply-To: <abc@mail.example.com>');
    expect(head).toContain('References: <root@mail.example.com> <abc@mail.example.com>');
    expect(head).toContain(
      `Subject: =?UTF-8?B?${Buffer.from('Re: Can we meet next week? — café').toString('base64')}?=`,
    );
    expect(head).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(body).toBe('Hi Sam,\n\nTuesday works — 10:00?\n');
  });

  it('refuses to send header injection through the recipient list', async () => {
    const send = vi.spyOn(messagesApi, 'send');
    await expect(
      sendReply(emailAccount, {
        sourceMessageId: messageId,
        to: ['sam@client.example\r\nBcc: everyone@example.com'],
        subject: 'Re: hi',
        body: 'x',
      }),
    ).rejects.toThrow(/recipient/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('creates an event that invites the attendee, with a Meet link, and stores it as busy time', async () => {
    const insert = vi.spyOn(eventsApi, 'insert').mockResolvedValue({
      data: {
        id: 'gcal-new-1',
        summary: 'Founder <> Sam',
        start: { dateTime: '2026-10-20T10:00:00Z' },
        end: { dateTime: '2026-10-20T10:30:00Z' },
        status: 'confirmed',
        attendees: [{ email: 'sam@client.example', responseStatus: 'needsAction' }],
      },
    } as never);

    const result = await createCalendarEvent(calendarAccount, {
      title: 'Founder <> Sam',
      description: 'Booked by Mimus',
      start: '2026-10-20T10:00:00.000Z',
      end: '2026-10-20T10:30:00.000Z',
      attendees: ['sam@client.example'],
      videoLink: true,
    });

    expect(result).toEqual({ providerEventId: 'gcal-new-1' });
    const request = insert.mock.calls[0][0] as Record<string, unknown> & {
      requestBody: Record<string, unknown>;
    };
    expect(request).toMatchObject({
      calendarId: 'primary',
      sendUpdates: 'all',
      conferenceDataVersion: 1,
    });
    expect(request.requestBody).toMatchObject({
      summary: 'Founder <> Sam',
      start: { dateTime: '2026-10-20T10:00:00.000Z' },
      end: { dateTime: '2026-10-20T10:30:00.000Z' },
      attendees: [{ email: 'sam@client.example' }],
      conferenceData: { createRequest: { conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    });

    const { data: stored } = await service
      .from('events')
      .select('title, starts_at')
      .eq('connected_account_id', calendarAccount)
      .eq('provider_event_id', 'gcal-new-1')
      .single()
      .throwOnError();
    expect(stored!.title).toBe('Founder <> Sam');
  });

  it('refuses when the account never allowed sending and booking', async () => {
    const send = vi.spyOn(messagesApi, 'send');
    await expect(
      sendReply(readOnlyEmailAccount, {
        sourceMessageId: messageId,
        to: ['a@b.example'],
        subject: 'x',
        body: 'y',
      }),
    ).rejects.toBeInstanceOf(WriteAccessError);
    expect(send).not.toHaveBeenCalled();
  });
});
