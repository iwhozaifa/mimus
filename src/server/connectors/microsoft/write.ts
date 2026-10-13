import { createServiceClient } from '@/src/db/service';
import { normalizeCalendarEvent } from '@/src/server/connectors/microsoft/calendar';
import { getAuthorizedGraphClient } from '@/src/server/connectors/microsoft/client';
import { SCOPES } from '@/src/server/connectors/microsoft/oauth';
import type { NewCalendarEvent, ReplyDraft, SendResult } from '@/src/server/connectors/types';
import { writeScopesFor } from '@/src/server/connectors/writeScopes';
import { upsertEvent } from '@/src/server/shared/normalize';
import type { Event } from '@microsoft/microsoft-graph-types';

const WRITE = [...SCOPES, ...writeScopesFor('microsoft')];

// Graph wants wall-clock time plus a zone; send UTC without the "Z".
const graphDateTime = (iso: string) => ({
  dateTime: new Date(iso).toISOString().slice(0, -1),
  timeZone: 'UTC',
});

// Replies to the original Outlook message, so Outlook threads and quotes
// it itself. The reply goes to draft.to, not to everyone on the original.
export async function sendMicrosoftReply(
  emailAccountId: string,
  draft: ReplyDraft,
): Promise<SendResult> {
  const supabase = createServiceClient();
  const { data: message } = await supabase
    .from('messages')
    .select('provider_message_id')
    .eq('id', draft.sourceMessageId)
    .eq('connected_account_id', emailAccountId)
    .single()
    .throwOnError();

  const client = await getAuthorizedGraphClient(emailAccountId, WRITE);
  await client.api(`/me/messages/${encodeURIComponent(message!.provider_message_id)}/reply`).post({
    message: { toRecipients: draft.to.map((address) => ({ emailAddress: { address } })) },
    comment: draft.body,
  });
  // Graph's reply action returns no body, so there is no new message id.
  return { providerMessageId: message!.provider_message_id };
}

// Outlook sends each attendee an invitation when the event is created.
export async function createMicrosoftEvent(
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

  const client = await getAuthorizedGraphClient(calendarAccountId, WRITE);
  const created: Event = await client.api('/me/events').post({
    subject: event.title,
    body: { contentType: 'text', content: event.description ?? '' },
    start: graphDateTime(event.start),
    end: graphDateTime(event.end),
    attendees: event.attendees.map((address) => ({ emailAddress: { address }, type: 'required' })),
    isOnlineMeeting: event.videoLink,
  });

  await upsertEvent(account!.workspace_id, calendarAccountId, normalizeCalendarEvent(created));
  return { providerEventId: created.id! };
}
