import { createServiceClient } from '@/src/db/service';
import { normalizeCalendarEvent } from '@/src/server/connectors/google/calendar';
import { getAuthorizedClient } from '@/src/server/connectors/google/client';
import { normalizeGmailMessage } from '@/src/server/connectors/google/gmail';
import { QuotaPacer } from '@/src/server/connectors/google/pacer';
import { withGoogleRateLimitRetry } from '@/src/server/connectors/google/retry';
import { upsertEvent, upsertMessage } from '@/src/server/shared/normalize';
import { google } from 'googleapis';

const BACKFILL_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

// Gmail per-user quota costs (units) -- see
// https://developers.google.com/workspace/gmail/api/reference/quota.
const THREADS_LIST_COST = 10;
const THREADS_GET_COST = 40;

// Half of Gmail's 6,000 units/min/user (projects created on/after
// 2026-05-01), leaving headroom for live sync and Google's sub-minute
// enforcement. Override per environment if a project's quota differs.
const DEFAULT_GMAIL_UNITS_PER_MINUTE = 3000;

// Spam/trash are noise, and promotions/social (newsletters, notifications)
// are out of scope for a chief of staff -- excluding them is the single
// biggest quota saving on a typical inbox.
const GMAIL_BACKFILL_EXCLUSIONS = '-in:spam -in:trash -category:promotions -category:social';

function gmailUnitsPerMinute(): number {
  const raw = Number.parseInt(process.env.GMAIL_BACKFILL_UNITS_PER_MINUTE ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_GMAIL_UNITS_PER_MINUTE;
}

// Highest Gmail historyId already stored per thread, so a re-run (resume
// after a failure, or a reconnect) can skip threads that haven't changed.
async function storedThreadHistoryIds(
  connectedAccountId: string,
  threadIds: string[],
): Promise<Map<string, bigint>> {
  const stored = new Map<string, bigint>();
  if (threadIds.length === 0) return stored;

  const { data } = await createServiceClient()
    .from('messages')
    .select('thread_id, history_id:raw->>historyId')
    .eq('connected_account_id', connectedAccountId)
    .in('thread_id', threadIds)
    .throwOnError();

  for (const row of data ?? []) {
    if (!row.thread_id || !row.history_id) continue;
    const historyId = BigInt(row.history_id as string);
    const current = stored.get(row.thread_id);
    if (current === undefined || historyId > current) stored.set(row.thread_id, historyId);
  }
  return stored;
}

// Fetches whole threads (threads.get = 40 units for every message in the
// conversation) rather than one messages.get (20 units) per message --
// cheaper once a thread has 2+ messages, which most of a founder's inbox
// does. Every call goes through a QuotaPacer so the import spends quota
// evenly instead of bursting into Gmail's per-user rate limit.
async function backfillGmail(
  connectedAccountId: string,
  workspaceId: string,
  auth: Awaited<ReturnType<typeof getAuthorizedClient>>,
): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth });
  const afterEpochSeconds = Math.floor((Date.now() - BACKFILL_WINDOW_MS) / 1000);
  const pacer = new QuotaPacer({ unitsPerMinute: gmailUnitsPerMinute() });
  const paced = <T>(cost: number, call: () => Promise<T>) =>
    withGoogleRateLimitRetry(
      async () => {
        await pacer.take(cost);
        return call();
      },
      { onRateLimit: () => pacer.slowDown() },
    );

  let pageToken: string | undefined;
  do {
    const { data } = await paced(THREADS_LIST_COST, () =>
      gmail.users.threads.list({
        userId: 'me',
        q: `after:${afterEpochSeconds} ${GMAIL_BACKFILL_EXCLUSIONS}`,
        pageToken,
      }),
    );

    const threads = data.threads ?? [];
    const stored = await storedThreadHistoryIds(
      connectedAccountId,
      threads.map((t) => t.id!),
    );

    for (const ref of threads) {
      const storedHistoryId = stored.get(ref.id!);
      if (
        storedHistoryId !== undefined &&
        ref.historyId &&
        storedHistoryId >= BigInt(ref.historyId)
      ) {
        continue;
      }

      const { data: thread } = await paced(THREADS_GET_COST, () =>
        gmail.users.threads.get({ userId: 'me', id: ref.id!, format: 'full' }),
      );
      for (const message of thread.messages ?? []) {
        await upsertMessage(workspaceId, connectedAccountId, normalizeGmailMessage(message));
      }
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
