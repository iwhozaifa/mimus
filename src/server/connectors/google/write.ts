import { createServiceClient } from '@/src/db/service';
import { normalizeCalendarEvent } from '@/src/server/connectors/google/calendar';
import { getAuthorizedClient } from '@/src/server/connectors/google/client';
import type { NewCalendarEvent, ReplyDraft, SendResult } from '@/src/server/connectors/types';
import { upsertEvent } from '@/src/server/shared/normalize';
import { google } from 'googleapis';
import { randomUUID } from 'node:crypto';

interface GmailHeader {
  name?: string;
  value?: string;
}

function header(raw: unknown, name: string): string | undefined {
  const headers = (raw as { payload?: { headers?: GmailHeader[] } } | null)?.payload?.headers;
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;
}

// RFC 2047 encoded-word, so a subject with non-ASCII characters survives.
function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function assertSafeHeader(value: string, what: string) {
  if (/[\r\n]/.test(value)) throw new Error(`Invalid ${what}: line breaks are not allowed`);
}

// A plain-text reply in the same Gmail thread, with In-Reply-To and
// References taken from the stored original so mail clients thread it.
export async function sendGoogleReply(
  emailAccountId: string,
  draft: ReplyDraft,
): Promise<SendResult> {
  for (const to of draft.to) assertSafeHeader(to, 'recipient');
  assertSafeHeader(draft.subject, 'subject');

  const supabase = createServiceClient();
  const [{ data: account }, { data: message }] = await Promise.all([
    supabase
      .from('connected_accounts')
      .select('external_account_id')
      .eq('id', emailAccountId)
      .single()
      .throwOnError(),
    supabase
      .from('messages')
      .select('thread_id, raw')
      .eq('id', draft.sourceMessageId)
      .eq('connected_account_id', emailAccountId)
      .single()
      .throwOnError(),
  ]);

  const messageId = header(message!.raw, 'Message-ID');
  const references = [header(message!.raw, 'References'), messageId].filter(Boolean).join(' ');
  const body = Buffer.from(draft.body, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  const mime = [
    `From: ${account!.external_account_id}`,
    `To: ${draft.to.join(', ')}`,
    `Subject: ${encodeHeader(draft.subject)}`,
    ...(messageId ? [`In-Reply-To: ${messageId}`, `References: ${references}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');

  const gmail = google.gmail({ version: 'v1', auth: await getAuthorizedClient(emailAccountId) });
  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: Buffer.from(mime, 'utf8').toString('base64url'),
      threadId: message!.thread_id ?? undefined,
    },
  });
  return { providerMessageId: response.data.id! };
}

// Creates the event on the primary calendar; sendUpdates 'all' makes
// Google email each attendee an invitation. Stored right away so the new
// meeting counts as busy time before the next sync.
export async function createGoogleEvent(
  calendarAccountId: string,
  event: NewCalendarEvent,
): Promise<{ providerEventId: string }> {
  const supabase = createServiceClient();
  const { data: account } = await supabase
    .from('connected_accounts')
    .select('workspace_id')
    .eq('id', calendarAccountId)
    .single()
    .throwOnError();

  const calendar = google.calendar({
    version: 'v3',
    auth: await getAuthorizedClient(calendarAccountId),
  });
  const response = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'all',
    conferenceDataVersion: event.videoLink ? 1 : 0,
    requestBody: {
      summary: event.title,
      description: event.description,
      start: { dateTime: event.start },
      end: { dateTime: event.end },
      attendees: event.attendees.map((email) => ({ email })),
      ...(event.videoLink
        ? {
            conferenceData: {
              createRequest: {
                requestId: randomUUID(),
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
          }
        : {}),
    },
  });

  await upsertEvent(
    account!.workspace_id,
    calendarAccountId,
    normalizeCalendarEvent(response.data, 'primary'),
  );
  return { providerEventId: response.data.id! };
}
