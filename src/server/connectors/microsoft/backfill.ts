import { createServiceClient } from '@/src/db/service';
import { normalizeCalendarEvent } from '@/src/server/connectors/microsoft/calendar';
import { getAuthorizedGraphClient } from '@/src/server/connectors/microsoft/client';
import { normalizeGraphMessage } from '@/src/server/connectors/microsoft/mail';
import { upsertEvent, upsertMessage } from '@/src/server/shared/normalize';
import type { Client } from '@microsoft/microsoft-graph-client';
import type { Event, Message } from '@microsoft/microsoft-graph-types';

const BACKFILL_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

// Unlike Google's events.list, Graph's calendarView requires an explicit
// end bound -- there's no "no upper bound" option. Two years out is a
// pragmatic stand-in for Google's unbounded forward window (see
// google/backfill.ts's comment on why upcoming meetings matter here too).
const FORWARD_WINDOW_MS = 2 * 365 * 24 * 60 * 60 * 1000;

interface GraphPage<T> {
  value?: T[];
  '@odata.nextLink'?: string;
}

async function backfillMail(
  connectedAccountId: string,
  workspaceId: string,
  client: Client,
  selfEmail: string,
): Promise<void> {
  const sinceIso = new Date(Date.now() - BACKFILL_WINDOW_MS).toISOString();

  // /me/messages lists across the whole mailbox (not just Inbox), matching
  // Gmail's whole-mailbox `after:` search used by the Google connector.
  let response: GraphPage<Message> = await client
    .api('/me/messages')
    .filter(`receivedDateTime ge ${sinceIso}`)
    .top(50)
    .get();

  while (true) {
    for (const message of response.value ?? []) {
      await upsertMessage(
        workspaceId,
        connectedAccountId,
        normalizeGraphMessage(message, selfEmail),
      );
    }
    const nextLink = response['@odata.nextLink'];
    if (!nextLink) break;
    response = await client.api(nextLink).get();
  }
}

async function backfillCalendar(
  connectedAccountId: string,
  workspaceId: string,
  client: Client,
): Promise<void> {
  const startDateTime = new Date(Date.now() - BACKFILL_WINDOW_MS).toISOString();
  const endDateTime = new Date(Date.now() + FORWARD_WINDOW_MS).toISOString();

  // calendarView (not /me/events) expands recurring series into individual
  // occurrences, matching Google's singleEvents: true. The Prefer header is
  // required for normalizeCalendarEvent's UTC assumption to hold -- see its
  // comment.
  let response: GraphPage<Event> = await client
    .api('/me/calendarView')
    .header('Prefer', 'outlook.timezone="UTC"')
    .query({ startDateTime, endDateTime })
    .top(50)
    .get();

  while (true) {
    for (const event of response.value ?? []) {
      await upsertEvent(workspaceId, connectedAccountId, normalizeCalendarEvent(event, 'primary'));
    }
    const nextLink = response['@odata.nextLink'];
    if (!nextLink) break;
    response = await client.api(nextLink).get();
  }
}

export async function backfillMicrosoftAccount(connectedAccountId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: account, error } = await supabase
    .from('connected_accounts')
    .select('workspace_id, account_type, external_account_id')
    .eq('id', connectedAccountId)
    .single();
  if (error) throw error;

  const client = await getAuthorizedGraphClient(connectedAccountId);
  const workspaceId = account.workspace_id as string;

  if (account.account_type === 'email') {
    if (!account.external_account_id) {
      throw new Error(`Connected account ${connectedAccountId} has no external_account_id`);
    }
    await backfillMail(connectedAccountId, workspaceId, client, account.external_account_id);
  } else if (account.account_type === 'calendar') {
    await backfillCalendar(connectedAccountId, workspaceId, client);
  } else {
    throw new Error(`Microsoft backfill does not support account_type "${account.account_type}"`);
  }

  await supabase
    .from('connected_accounts')
    .update({ backfill_completed_at: new Date().toISOString() })
    .eq('id', connectedAccountId)
    .throwOnError();
}
