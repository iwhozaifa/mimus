import { createServiceClient } from '@/src/db/service';
import { getDecryptedAccessToken } from '@/src/server/connectors/calendly/client';
import { verifyCalendlySignature } from '@/src/server/connectors/calendly/signature';
import { syncOneCalendlyEvent } from '@/src/server/connectors/calendly/sync';
import { upsertEvent } from '@/src/server/shared/normalize';

const SUBSCRIBED_EVENTS = ['invitee.created', 'invitee.canceled'];

// Deliberately not routed through client.ts's calendlyGet() -- this is
// the one legitimate write Mimus ever makes against Calendly, and it's
// webhook-subscription *management*, not a booking action. Keeping it
// out of the GET-only content client makes that boundary structural
// rather than just documented: nothing in the booking-content path
// (sync.ts) can reach this.
//
// Each connected account gets its own 'user'-scoped subscription (not
// one shared 'organization'-scoped subscription) so a regular member can
// self-serve this without needing org-admin privileges, mirroring
// Google/Microsoft's per-account watch()/subscription registration. All
// subscriptions share one deployed callback URL, disambiguated by a
// `?account=<connectedAccountId>` query param this function adds --
// Calendly's webhook payload itself carries no caller-supplied context
// that would otherwise identify which of our subscriptions fired.
export async function registerCalendlyWebhook(connectedAccountId: string): Promise<void> {
  const webhookUrl = process.env.CALENDLY_WEBHOOK_URL;
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!webhookUrl || !signingKey) {
    throw new Error('CALENDLY_WEBHOOK_URL/CALENDLY_WEBHOOK_SIGNING_KEY is not configured');
  }

  const supabase = createServiceClient();
  const { data: account, error } = await supabase
    .from('connected_accounts')
    .select('external_account_id, provider_team_id')
    .eq('id', connectedAccountId)
    .single();
  if (error) throw error;
  if (!account.provider_team_id) {
    throw new Error(`Connected account ${connectedAccountId} has no stored organization URI`);
  }

  const accessToken = await getDecryptedAccessToken(connectedAccountId);
  const callbackUrl = new URL(webhookUrl);
  callbackUrl.searchParams.set('account', connectedAccountId);

  const response = await fetch('https://api.calendly.com/webhook_subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: callbackUrl.toString(),
      events: SUBSCRIBED_EVENTS,
      organization: account.provider_team_id,
      user: account.external_account_id,
      scope: 'user',
      // We choose the signing key up front (rather than reading the one
      // Calendly would otherwise generate) so the same
      // CALENDLY_WEBHOOK_SIGNING_KEY value verifies every connected
      // account's deliveries, not a different key per subscription.
      signing_key: signingKey,
    }),
  });
  if (!response.ok) {
    throw new Error(`Calendly webhook subscription creation failed: ${response.status}`);
  }
}

interface CalendlyWebhookBody {
  event?: string;
  payload?: { event?: string };
}

export async function handleCalendlyWebhook(request: Request): Promise<Response> {
  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    throw new Error('CALENDLY_WEBHOOK_SIGNING_KEY is not configured');
  }

  const rawBody = await request.text();
  const header = request.headers.get('calendly-webhook-signature');
  if (!verifyCalendlySignature({ signingKey, header, rawBody })) {
    return new Response('invalid signature', { status: 401 });
  }

  const connectedAccountId = new URL(request.url).searchParams.get('account');
  const body = JSON.parse(rawBody) as CalendlyWebhookBody;
  const eventUri = body.payload?.event;

  if (connectedAccountId && eventUri && body.event && SUBSCRIBED_EVENTS.includes(body.event)) {
    const supabase = createServiceClient();
    const { data: account, error } = await supabase
      .from('connected_accounts')
      .select('workspace_id, status')
      .eq('id', connectedAccountId)
      .single();
    if (error) throw error;

    if (account.status === 'connected') {
      const accessToken = await getDecryptedAccessToken(connectedAccountId);
      const normalized = await syncOneCalendlyEvent(accessToken, eventUri);
      await upsertEvent(account.workspace_id as string, connectedAccountId, normalized);
    }
  }

  return new Response(null, { status: 204 });
}
