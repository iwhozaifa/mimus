import { createServiceClient } from '@/src/db/service';
import { normalizeGmailMessage } from '@/src/server/connectors/google/gmail';
import { getAuthorizedClient } from '@/src/server/connectors/google/client';
import { upsertMessage } from '@/src/server/shared/normalize';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

// Gmail watch()/stop() need the INBOX label, matching backfill.ts's
// whole-mailbox scope -- this never watches a narrower label set.
const WATCH_LABEL_IDS = ['INBOX'];

// Renew a watch once it's within this long of expiring, not only once it
// has actually expired -- Gmail watch() lives at most 7 days
// (604800 seconds), so a daily cron with this buffer always catches it in
// time even if a single run is missed.
const RENEW_BUFFER_MS = 24 * 60 * 60 * 1000;

const oidcClient = new OAuth2Client();

// Pub/Sub push authentication: Google signs an OIDC token (not a request
// signature) in the Authorization header when the push subscription is
// configured with an attached service account, audience set to this
// endpoint's own URL. Verifying it against Google's public certs is what
// proves the request actually came from Pub/Sub and not an attacker who
// guessed the webhook URL. See
// https://cloud.google.com/pubsub/docs/push#authentication_and_authorization.
export async function verifyPubSubAuth(authorizationHeader: string | null): Promise<void> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new Error('Missing bearer token on Pub/Sub push request');
  }
  const audience = process.env.GOOGLE_PUBSUB_AUDIENCE;
  if (!audience) {
    throw new Error('GOOGLE_PUBSUB_AUDIENCE is not configured');
  }

  const token = authorizationHeader.slice('Bearer '.length);
  const ticket = await oidcClient.verifyIdToken({ idToken: token, audience });
  const payload = ticket.getPayload();

  const expectedServiceAccount = process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL;
  if (expectedServiceAccount && payload?.email !== expectedServiceAccount) {
    throw new Error('Pub/Sub push token was not issued to the expected service account');
  }
}

export interface PubSubPushEnvelope {
  message?: { data?: string; messageId?: string };
  subscription?: string;
}

export interface GmailPushNotification {
  emailAddress: string;
  historyId: string;
}

// Gmail's watch() payload, base64-encoded in the Pub/Sub envelope's
// message.data, per
// https://developers.google.com/gmail/api/guides/push#receiving_notifications.
export function decodePubSubMessage(envelope: PubSubPushEnvelope): GmailPushNotification {
  const data = envelope.message?.data;
  if (!data) {
    throw new Error('Pub/Sub push envelope has no message.data');
  }
  const decoded = JSON.parse(
    Buffer.from(data, 'base64').toString('utf8'),
  ) as Partial<GmailPushNotification>;
  if (!decoded.emailAddress || !decoded.historyId) {
    throw new Error('Decoded Pub/Sub message is missing emailAddress/historyId');
  }
  return { emailAddress: decoded.emailAddress, historyId: decoded.historyId };
}

// Fetches everything added to the mailbox between the account's stored
// sync_cursor (a Gmail historyId) and the new one Pub/Sub just announced,
// and advances the cursor once done. If there's no stored cursor yet (the
// watch was only just registered and hasn't been renewed), there is
// nothing to diff against -- just adopt the new historyId as the
// baseline, matching how registerGmailWatch seeds it initially.
async function syncGmailHistory(
  connectedAccountId: string,
  workspaceId: string,
  newHistoryId: string,
): Promise<void> {
  const supabase = createServiceClient();
  const { data: account, error } = await supabase
    .from('connected_accounts')
    .select('sync_cursor')
    .eq('id', connectedAccountId)
    .single();
  if (error) throw error;

  const startHistoryId = account.sync_cursor as string | null;
  if (startHistoryId) {
    const auth = await getAuthorizedClient(connectedAccountId);
    const gmail = google.gmail({ version: 'v1', auth });

    let pageToken: string | undefined;
    do {
      const { data } = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        pageToken,
      });

      for (const record of data.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          if (!added.message?.id) continue;
          const { data: full } = await gmail.users.messages.get({
            userId: 'me',
            id: added.message.id,
            format: 'full',
          });
          await upsertMessage(workspaceId, connectedAccountId, normalizeGmailMessage(full));
        }
      }

      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  await supabase
    .from('connected_accounts')
    .update({ sync_cursor: newHistoryId })
    .eq('id', connectedAccountId)
    .throwOnError();
}

export async function handleGmailPushNotification(
  notification: GmailPushNotification,
): Promise<void> {
  const supabase = createServiceClient();
  const { data: accounts, error } = await supabase
    .from('connected_accounts')
    .select('id, workspace_id')
    .eq('provider', 'google')
    .eq('account_type', 'email')
    .eq('status', 'connected')
    .ilike('external_account_id', notification.emailAddress);
  if (error) throw error;

  for (const account of accounts ?? []) {
    await syncGmailHistory(
      account.id as string,
      account.workspace_id as string,
      notification.historyId,
    );
  }
}

export async function handleGooglePubSubPush(request: Request): Promise<Response> {
  await verifyPubSubAuth(request.headers.get('authorization'));
  const envelope = (await request.json()) as PubSubPushEnvelope;
  const notification = decodePubSubMessage(envelope);
  await handleGmailPushNotification(notification);
  return new Response(null, { status: 204 });
}

// Registers (or re-registers, for renewal) a Gmail watch for one email
// account, storing the resulting historyId as the new sync baseline and
// the expiration as the renewal cron's trigger. Requires
// GOOGLE_PUBSUB_TOPIC -- a Cloud Pub/Sub topic with a publish IAM binding
// for gmail-api-push@system.gserviceaccount.com (see README's Outstanding
// setup list) -- which only exists once the repo owner has created it.
export async function registerGmailWatch(connectedAccountId: string): Promise<void> {
  const topicName = process.env.GOOGLE_PUBSUB_TOPIC;
  if (!topicName) {
    throw new Error('GOOGLE_PUBSUB_TOPIC is not configured');
  }

  const auth = await getAuthorizedClient(connectedAccountId);
  const gmail = google.gmail({ version: 'v1', auth });
  const { data } = await gmail.users.watch({
    userId: 'me',
    requestBody: { topicName, labelIds: WATCH_LABEL_IDS },
  });
  if (!data.historyId || !data.expiration) {
    throw new Error('Gmail watch() did not return a historyId/expiration');
  }

  const supabase = createServiceClient();
  await supabase
    .from('connected_accounts')
    .update({
      sync_cursor: data.historyId,
      watch_expires_at: new Date(Number(data.expiration)).toISOString(),
    })
    .eq('id', connectedAccountId)
    .throwOnError();
}

// Called on disconnect so a stopped account doesn't keep triggering Pub/Sub
// pushes -- Gmail has no per-account unsubscribe other than this.
export async function stopGmailWatch(connectedAccountId: string): Promise<void> {
  const auth = await getAuthorizedClient(connectedAccountId);
  const gmail = google.gmail({ version: 'v1', auth });
  await gmail.users.stop({ userId: 'me' });
}

// The renewal cron's Google half: finds every connected Gmail account
// whose watch is due (or already expired) and re-registers it. Each
// account is renewed independently so one failure doesn't block the rest.
export async function renewGmailWatchesIfNeeded(): Promise<{
  renewed: string[];
  failed: Array<{ connectedAccountId: string; error: string }>;
}> {
  const supabase = createServiceClient();
  const dueBefore = new Date(Date.now() + RENEW_BUFFER_MS).toISOString();

  const { data: due, error } = await supabase
    .from('connected_accounts')
    .select('id')
    .eq('provider', 'google')
    .eq('account_type', 'email')
    .eq('status', 'connected')
    .or(`watch_expires_at.is.null,watch_expires_at.lte.${dueBefore}`);
  if (error) throw error;

  const renewed: string[] = [];
  const failed: Array<{ connectedAccountId: string; error: string }> = [];

  for (const account of due ?? []) {
    const connectedAccountId = account.id as string;
    try {
      await registerGmailWatch(connectedAccountId);
      renewed.push(connectedAccountId);
    } catch (err) {
      failed.push({ connectedAccountId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { renewed, failed };
}
