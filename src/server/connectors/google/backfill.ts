import { createServiceClient } from '@/src/db/service';
import { normalizeCalendarEvent } from '@/src/server/connectors/google/calendar';
import { getAuthorizedClient } from '@/src/server/connectors/google/client';
import { normalizeGmailMessage } from '@/src/server/connectors/google/gmail';
import { upsertEvent, upsertMessage } from '@/src/server/shared/normalize';
import { google } from 'googleapis';

const BACKFILL_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

async function backfillGmail(
  connectedAccountId: string,
  workspaceId: string,
  auth: Awaited<ReturnType<typeof getAuthorizedClient>>,
): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth });
  const afterEpochSeconds = Math.floor((Date.now() - BACKFILL_WINDOW_MS) / 1000);

  let pageToken: string | undefined;
  do {
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${afterEpochSeconds}`,
      pageToken,
    });

    for (const ref of data.messages ?? []) {
      const { data: full } = await gmail.users.messages.get({
        userId: 'me',
        id: ref.id!,
        format: 'full',
      });
      await upsertMessage(workspaceId, connectedAccountId, normalizeGmailMessage(full));
    }

    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
}

// No timeMax -- a chief-of-staff assistant needs upcoming scheduled
// meetings just as much as the past 90 days, and Calendar's list API
// defaults to no upper bound.
async function backfillCalendar(
  connectedAccountId: string,
  workspaceId: string,
  auth: Awaited<ReturnType<typeof getAuthorizedClient>>,
): Promise<void> {
  const calendar = google.calendar({ version: 'v3', auth });
  const timeMin = new Date(Date.now() - BACKFILL_WINDOW_MS).toISOString();

  let pageToken: string | undefined;
  do {
    const { data } = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      singleEvents: true,
      pageToken,
    });

    for (const event of data.items ?? []) {
      await upsertEvent(workspaceId, connectedAccountId, normalizeCalendarEvent(event, 'primary'));
    }

    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
}

export async function backfillGoogleAccount(connectedAccountId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: account, error } = await supabase
    .from('connected_accounts')
    .select('workspace_id, account_type')
    .eq('id', connectedAccountId)
    .single();
  if (error) throw error;

  const auth = await getAuthorizedClient(connectedAccountId);
  const workspaceId = account.workspace_id as string;

  if (account.account_type === 'email') {
    await backfillGmail(connectedAccountId, workspaceId, auth);
  } else if (account.account_type === 'calendar') {
    await backfillCalendar(connectedAccountId, workspaceId, auth);
  } else {
    throw new Error(`Google backfill does not support account_type "${account.account_type}"`);
  }

  await supabase
    .from('connected_accounts')
    .update({ backfill_completed_at: new Date().toISOString() })
    .eq('id', connectedAccountId)
    .throwOnError();
}
