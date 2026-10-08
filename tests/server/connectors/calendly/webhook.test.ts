import { createServiceClient } from '@/src/db/service';
import {
  handleCalendlyWebhook,
  registerCalendlyWebhook,
} from '@/src/server/connectors/calendly/webhook';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';
import { randomUUID, createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SIGNING_KEY = 'test-signing-key';

function signedHeader(timestamp: string, rawBody: string): string {
  const digest = createHmac('sha256', SIGNING_KEY).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

function mockCalendlyApi(handler: (url: URL, init: RequestInit | undefined) => unknown) {
  const realFetch = globalThis.fetch;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname !== 'api.calendly.com') return realFetch(input, init);
    return new Response(JSON.stringify(handler(url, init)), { status: 200 });
  });
}

describe('calendly webhook', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.stubEnv('CALENDLY_WEBHOOK_URL', 'https://app.example.com/api/webhooks/calendly');
    vi.stubEnv('CALENDLY_WEBHOOK_SIGNING_KEY', SIGNING_KEY);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await Promise.all(createdUserIds.map((id) => supabase.auth.admin.deleteUser(id)));
    createdUserIds.length = 0;
  });

  async function makeConnectedAccount() {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Calendly webhook test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Calendly webhook test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `calendly-webhook-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);

    const { data: account } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: workspace!.id,
        owner_user_id: userId,
        provider: 'calendly',
        account_type: 'scheduling',
        external_account_id: 'https://api.calendly.com/users/abc',
        provider_team_id: 'https://api.calendly.com/organizations/def',
      })
      .select('id')
      .single()
      .throwOnError();

    const { ciphertext: encryptedAccessToken, keyVersion } = await encryptToken('access-123');
    await supabase
      .from('connected_account_secrets')
      .insert({
        connected_account_id: account!.id,
        encrypted_access_token: bufferToPgBytea(encryptedAccessToken),
        key_version: keyVersion,
      })
      .throwOnError();

    return { workspaceId: workspace!.id as string, connectedAccountId: account!.id as string };
  }

  describe('registerCalendlyWebhook', () => {
    it('creates a user-scoped subscription with the connected account tagged into the callback url', async () => {
      const { connectedAccountId } = await makeConnectedAccount();
      const apiCalls: Array<{ url: URL; init: RequestInit | undefined }> = [];

      mockCalendlyApi((url, init) => {
        apiCalls.push({ url, init });
        return { resource: { uri: 'https://api.calendly.com/webhook_subscriptions/sub-1' } };
      });

      await registerCalendlyWebhook(connectedAccountId);

      expect(apiCalls).toHaveLength(1);
      const { url, init } = apiCalls[0];
      expect(url.pathname).toBe('/webhook_subscriptions');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(init!.body as string);
      expect(body.scope).toBe('user');
      expect(body.user).toBe('https://api.calendly.com/users/abc');
      expect(body.organization).toBe('https://api.calendly.com/organizations/def');
      expect(body.signing_key).toBe(SIGNING_KEY);
      expect(new URL(body.url).searchParams.get('account')).toBe(connectedAccountId);
    });
  });

  describe('handleCalendlyWebhook', () => {
    it('rejects a request with an invalid signature', async () => {
      const rawBody = JSON.stringify({ event: 'invitee.created', payload: {} });
      const request = new Request('https://app.example.com/api/webhooks/calendly?account=x', {
        method: 'POST',
        headers: { 'calendly-webhook-signature': 't=0,v1=not-real' },
        body: rawBody,
      });

      const response = await handleCalendlyWebhook(request);
      expect(response.status).toBe(401);
    });

    it('re-syncs the referenced event for the account named in the callback url', async () => {
      const { workspaceId, connectedAccountId } = await makeConnectedAccount();

      mockCalendlyApi((url) => {
        if (url.pathname === '/scheduled_events/evt-1') {
          return {
            uri: 'https://api.calendly.com/scheduled_events/evt-1',
            name: 'Re-synced meeting',
            start_time: '2024-03-15T15:00:00.000000Z',
            end_time: '2024-03-15T15:30:00.000000Z',
          };
        }
        if (url.pathname === '/scheduled_events/evt-1/invitees') {
          return { collection: [], pagination: {} };
        }
        throw new Error(`unexpected path: ${url.pathname}`);
      });

      const rawBody = JSON.stringify({
        event: 'invitee.created',
        payload: { event: 'https://api.calendly.com/scheduled_events/evt-1' },
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const request = new Request(
        `https://app.example.com/api/webhooks/calendly?account=${connectedAccountId}`,
        {
          method: 'POST',
          headers: { 'calendly-webhook-signature': signedHeader(timestamp, rawBody) },
          body: rawBody,
        },
      );

      const response = await handleCalendlyWebhook(request);
      expect(response.status).toBe(204);

      const { data: events } = await supabase
        .from('events')
        .select('title')
        .eq('connected_account_id', connectedAccountId)
        .throwOnError();
      expect(events).toHaveLength(1);
      expect(events![0].title).toBe('Re-synced meeting');
      void workspaceId;
    });
  });
});
