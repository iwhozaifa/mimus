import { createServiceClient } from '@/src/db/service';
import { normalizeCalendarEvent } from '@/src/server/connectors/microsoft/calendar';
import { getAuthorizedGraphClient } from '@/src/server/connectors/microsoft/client';
import { normalizeGraphMessage } from '@/src/server/connectors/microsoft/mail';
import { upsertEvent, upsertMessage } from '@/src/server/shared/normalize';
import type { Event, Message } from '@microsoft/microsoft-graph-types';

const BACKFILL_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const FORWARD_WINDOW_MS = 2 * 365 * 24 * 60 * 60 * 1000;

// Graph caps subscription lifetime per resource type; 4230 minutes
// (~2.94 days) is the documented max for both /me/messages and /me/events,
// matching the sync_state migration's "<=3 days" comment.
const MAX_SUBSCRIPTION_MINUTES = 4230;

// Renew once within this long of expiring -- mirrors google/webhook.ts's
// RENEW_BUFFER_MS, sized down since Graph subscriptions live <=3 days
// rather than <=7.
const RENEW_BUFFER_MS = 12 * 60 * 60 * 1000;

interface GraphDeltaPage<T> {
  value?: Array<T & { '@removed'?: unknown }>;
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

export interface GraphChangeNotification {
  subscriptionId: string;
  clientState?: string;
  resource: string;
  changeType: string;
}

// Graph's subscription-validation handshake: on subscribe (and periodic
// re-validation), it POSTs here with ?validationToken=<token> and expects
// a 200 text/plain response echoing that token back, within 10 seconds.
// https://learn.microsoft.com/graph/webhooks#notification-endpoint-validation
export function handleGraphValidation(validationToken: string): Response {
  return new Response(validationToken, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
}

// Graph has no per-request cryptographic signature (unlike Pub/Sub's OIDC
// token) -- clientState is the documented authentication mechanism
// instead: an app-chosen opaque string, set when creating the
// subscription, that Graph echoes back unmodified on every notification.
// https://learn.microsoft.com/graph/webhooks#verifying-the-origin-of-a-notification
export function verifyClientState(received: string | undefined): void {
  const expected = process.env.MICROSOFT_GRAPH_CLIENT_STATE;
  if (!expected) {
    throw new Error('MICROSOFT_GRAPH_CLIENT_STATE is not configured');
  }
  if (received !== expected) {
    throw new Error('Graph notification clientState did not match');
  }
}

// Fetches everything changed since the account's stored sync_cursor (a
// Graph delta link), normalizes and upserts it, and advances the cursor to
// the fresh deltaLink Graph returns once the page sequence ends. With no
// stored cursor yet, starts a fresh delta sequence instead of attempting a
// diff -- same bootstrap behavior as google/webhook.ts's syncGmailHistory.
async function syncGraphDelta(
  connectedAccountId: string,
  workspaceId: string,
  accountType: 'email' | 'calendar',
  selfEmail: string | null,
): Promise<void> {
  const supabase = createServiceClient();
  const { data: account, error } = await supabase
    .from('connected_accounts')
    .select('sync_cursor')
    .eq('id', connectedAccountId)
    .single();
  if (error) throw error;

  const client = await getAuthorizedGraphClient(connectedAccountId);
  const storedDeltaLink = account.sync_cursor as string | null;

  let page: GraphDeltaPage<Message | Event>;
  if (storedDeltaLink) {
    page = await client.api(storedDeltaLink).get();
  } else if (accountType === 'email') {
    // Message delta is folder-scoped (no whole-mailbox equivalent) --
    // Inbox only, a narrower scope than backfill's whole-mailbox /me/messages.
    page = await client.api("/me/mailFolders('inbox')/messages/delta").get();
  } else {
    const startDateTime = new Date(Date.now() - BACKFILL_WINDOW_MS).toISOString();
    const endDateTime = new Date(Date.now() + FORWARD_WINDOW_MS).toISOString();
    page = await client
      .api('/me/calendarView/delta')
      .header('Prefer', 'outlook.timezone="UTC"')
      .query({ startDateTime, endDateTime })
      .get();
  }

  let deltaLink = page['@odata.deltaLink'];
  while (true) {
    for (const item of page.value ?? []) {
      if (item['@removed']) continue;
      if (accountType === 'email') {
        if (!selfEmail) {
          throw new Error(`Connected account ${connectedAccountId} has no external_account_id`);
        }
        await upsertMessage(
          workspaceId,
          connectedAccountId,
          normalizeGraphMessage(item as Message, selfEmail),
        );
      } else {
        await upsertEvent(
          workspaceId,
          connectedAccountId,
          normalizeCalendarEvent(item as Event, 'primary'),
        );
      }
    }

    const nextLink = page['@odata.nextLink'];
    if (!nextLink) break;
    page = await client.api(nextLink).get();
    deltaLink = page['@odata.deltaLink'] ?? deltaLink;
  }

  await supabase
    .from('connected_accounts')
    .update({ sync_cursor: deltaLink ?? storedDeltaLink })
    .eq('id', connectedAccountId)
    .throwOnError();
}

export async function handleGraphNotifications(
  notifications: GraphChangeNotification[],
): Promise<void> {
  const supabase = createServiceClient();

  for (const notification of notifications) {
    verifyClientState(notification.clientState);

    const { data: account, error } = await supabase
      .from('connected_accounts')
      .select('id, workspace_id, account_type, external_account_id')
      .eq('provider', 'microsoft')
      .eq('status', 'connected')
      .eq('watch_channel_id', notification.subscriptionId)
      .maybeSingle();
    if (error) throw error;
    if (!account) continue;

    await syncGraphDelta(
      account.id as string,
      account.workspace_id as string,
      account.account_type as 'email' | 'calendar',
      account.external_account_id as string | null,
    );
  }
}

export async function handleMicrosoftGraphWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get('validationToken');
  if (validationToken !== null) {
    return handleGraphValidation(validationToken);
  }

  const body = (await request.json()) as { value?: GraphChangeNotification[] };
  await handleGraphNotifications(body.value ?? []);
  // Graph requires a 2xx within a few seconds and doesn't inspect the body.
  return new Response(null, { status: 202 });
}

function resourceForAccountType(accountType: 'email' | 'calendar'): string {
  return accountType === 'email' ? '/me/messages' : '/me/events';
}

// Registers (or re-registers, for renewal after a subscription has already
// lapsed) a Graph change-notification subscription for one account.
// Requires MICROSOFT_GRAPH_NOTIFICATION_URL (this app's deployed webhook
// URL) and MICROSOFT_GRAPH_CLIENT_STATE (the shared secret
// verifyClientState checks incoming notifications against) -- neither
// exists until the repo owner has a deployed HTTPS URL (see README's
// Outstanding setup list).
export async function registerGraphSubscription(connectedAccountId: string): Promise<void> {
  const notificationUrl = process.env.MICROSOFT_GRAPH_NOTIFICATION_URL;
  const clientState = process.env.MICROSOFT_GRAPH_CLIENT_STATE;
  if (!notificationUrl || !clientState) {
    throw new Error(
      'MICROSOFT_GRAPH_NOTIFICATION_URL/MICROSOFT_GRAPH_CLIENT_STATE are not configured',
    );
  }

  const supabase = createServiceClient();
  const { data: account, error } = await supabase
    .from('connected_accounts')
    .select('account_type')
    .eq('id', connectedAccountId)
    .single();
  if (error) throw error;

  const client = await getAuthorizedGraphClient(connectedAccountId);
  const expirationDateTime = new Date(
    Date.now() + MAX_SUBSCRIPTION_MINUTES * 60 * 1000,
  ).toISOString();
  const resource = resourceForAccountType(account.account_type as 'email' | 'calendar');

  const subscription = (await client.api('/subscriptions').post({
    changeType: 'created,updated,deleted',
    notificationUrl,
    resource,
    expirationDateTime,
    clientState,
  })) as { id: string };

  await supabase
    .from('connected_accounts')
    .update({
      watch_channel_id: subscription.id,
      watch_resource_id: resource,
      watch_expires_at: expirationDateTime,
    })
    .eq('id', connectedAccountId)
    .throwOnError();
}

// Extends an existing subscription's expiration in place. If Graph no
// longer recognizes it (already lapsed, or deleted server-side), falls
// back to registering a fresh one rather than failing the whole renewal
// run.
async function renewOrRegisterGraphSubscription(connectedAccountId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: account, error } = await supabase
    .from('connected_accounts')
    .select('watch_channel_id')
    .eq('id', connectedAccountId)
    .single();
  if (error) throw error;

  const existingSubscriptionId = account.watch_channel_id as string | null;
  if (existingSubscriptionId) {
    try {
      const client = await getAuthorizedGraphClient(connectedAccountId);
      const expirationDateTime = new Date(
        Date.now() + MAX_SUBSCRIPTION_MINUTES * 60 * 1000,
      ).toISOString();
      await client.api(`/subscriptions/${existingSubscriptionId}`).patch({ expirationDateTime });
      await supabase
        .from('connected_accounts')
        .update({ watch_expires_at: expirationDateTime })
        .eq('id', connectedAccountId)
        .throwOnError();
      return;
    } catch {
      // Falls through to re-register below.
    }
  }

  await registerGraphSubscription(connectedAccountId);
}

// The renewal cron's Microsoft half -- see google/webhook.ts's
// renewGmailWatchesIfNeeded for the matching Google-side function.
export async function renewGraphSubscriptionsIfNeeded(): Promise<{
  renewed: string[];
  failed: Array<{ connectedAccountId: string; error: string }>;
}> {
  const supabase = createServiceClient();
  const dueBefore = new Date(Date.now() + RENEW_BUFFER_MS).toISOString();

  const { data: due, error } = await supabase
    .from('connected_accounts')
    .select('id')
    .eq('provider', 'microsoft')
    .eq('status', 'connected')
    .or(`watch_expires_at.is.null,watch_expires_at.lte.${dueBefore}`);
  if (error) throw error;

  const renewed: string[] = [];
  const failed: Array<{ connectedAccountId: string; error: string }> = [];

  for (const account of due ?? []) {
    const connectedAccountId = account.id as string;
    try {
      await renewOrRegisterGraphSubscription(connectedAccountId);
      renewed.push(connectedAccountId);
    } catch (err) {
      failed.push({ connectedAccountId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { renewed, failed };
}
