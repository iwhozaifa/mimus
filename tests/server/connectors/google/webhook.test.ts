import { createServiceClient } from '@/src/db/service';
import {
  decodePubSubMessage,
  handleGmailPushNotification,
  handleGooglePubSubPush,
  registerGmailWatch,
  renewGmailWatchesIfNeeded,
  verifyPubSubAuth,
} from '@/src/server/connectors/google/webhook';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { gmail_v1 } from 'googleapis';

describe('google webhook', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('GOOGLE_OAUTH_REDIRECT_URI', 'http://localhost:3000/api/connectors/google/callback');
    vi.stubEnv('GOOGLE_PUBSUB_AUDIENCE', 'https://app.example.com/api/webhooks/google/pubsub');
    vi.stubEnv('GOOGLE_PUBSUB_TOPIC', 'projects/test-project/topics/gmail-push');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await Promise.all(createdUserIds.map((id) => supabase.auth.admin.deleteUser(id)));
    createdUserIds.length = 0;
  });

  async function makeConnectedAccount(externalAccountId = 'founder@example.com') {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Webhook test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Webhook test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `webhook-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);

    const { data: account } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: workspace!.id,
        owner_user_id: userId,
        provider: 'google',
        account_type: 'email',
        external_account_id: externalAccountId,
      })
      .select('id')
      .single()
      .throwOnError();

    const { ciphertext: encryptedAccessToken, keyVersion } = await encryptToken('access-123');
    const { ciphertext: encryptedRefreshToken } = await encryptToken('refresh-123');
    await supabase
      .from('connected_account_secrets')
      .insert({
        connected_account_id: account!.id,
        encrypted_access_token: bufferToPgBytea(encryptedAccessToken),
        encrypted_refresh_token: bufferToPgBytea(encryptedRefreshToken),
        key_version: keyVersion,
      })
      .throwOnError();

    return {
      connectedAccountId: account!.id as string,
      workspaceId: workspace!.id as string,
    };
  }

  describe('verifyPubSubAuth', () => {
    it('rejects a request with no bearer token', async () => {
      await expect(verifyPubSubAuth(null)).rejects.toThrow(/missing bearer token/i);
    });

    it('rejects a token that fails OIDC verification', async () => {
      vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockRejectedValue(
        new Error('Wrong recipient'),
      );
      await expect(verifyPubSubAuth('Bearer bad-token')).rejects.toThrow('Wrong recipient');
    });

    it('rejects a token issued to the wrong service account', async () => {
      vi.stubEnv('GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL', 'expected@project.iam.gserviceaccount.com');
      vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({ email: 'someone-else@project.iam.gserviceaccount.com' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      await expect(verifyPubSubAuth('Bearer good-token')).rejects.toThrow(
        /not issued to the expected service account/i,
      );
    });

    it('accepts a valid token from the expected service account', async () => {
      vi.stubEnv('GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL', 'expected@project.iam.gserviceaccount.com');
      vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({ email: 'expected@project.iam.gserviceaccount.com' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      await expect(verifyPubSubAuth('Bearer good-token')).resolves.toBeUndefined();
    });
  });

  describe('decodePubSubMessage', () => {
    it('decodes a base64 JSON payload', () => {
      const data = Buffer.from(
        JSON.stringify({ emailAddress: 'founder@example.com', historyId: '98765' }),
      ).toString('base64');
      expect(decodePubSubMessage({ message: { data } })).toEqual({
        emailAddress: 'founder@example.com',
        historyId: '98765',
      });
    });

    it('throws on a missing message.data', () => {
      expect(() => decodePubSubMessage({})).toThrow(/no message.data/i);
    });

    it('throws when the decoded payload is missing fields', () => {
      const data = Buffer.from(JSON.stringify({ emailAddress: 'founder@example.com' })).toString(
        'base64',
      );
      expect(() => decodePubSubMessage({ message: { data } })).toThrow(/missing/i);
    });
  });

  describe('handleGmailPushNotification', () => {
    it('syncs new messages added since the stored cursor and advances it', async () => {
      const { connectedAccountId } = await makeConnectedAccount();
      await supabase
        .from('connected_accounts')
        .update({ sync_cursor: '100' })
        .eq('id', connectedAccountId)
        .throwOnError();

      const fixtureMessage: gmail_v1.Schema$Message = {
        id: 'msg-push-1',
        labelIds: ['INBOX'],
        internalDate: '1700000000000',
        payload: { headers: [{ name: 'From', value: 'jane@example.com' }] },
      };

      const historyPrototype = Object.getPrototypeOf(
        google.gmail({ version: 'v1', auth: new google.auth.OAuth2() }).users.history,
      );
      vi.spyOn(historyPrototype, 'list').mockResolvedValueOnce({
        data: { history: [{ messagesAdded: [{ message: { id: 'msg-push-1' } }] }] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const messagesPrototype = Object.getPrototypeOf(
        google.gmail({ version: 'v1', auth: new google.auth.OAuth2() }).users.messages,
      );
      vi.spyOn(messagesPrototype, 'get').mockResolvedValueOnce({
        data: fixtureMessage,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      await handleGmailPushNotification({ emailAddress: 'founder@example.com', historyId: '200' });

      const { data: messages } = await supabase
        .from('messages')
        .select('provider_message_id')
        .eq('connected_account_id', connectedAccountId)
        .throwOnError();
      expect(messages).toHaveLength(1);

      const { data: account } = await supabase
        .from('connected_accounts')
        .select('sync_cursor')
        .eq('id', connectedAccountId)
        .single()
        .throwOnError();
      expect(account!.sync_cursor).toBe('200');
    });

    it('adopts the new historyId as the baseline when there is no stored cursor yet', async () => {
      const { connectedAccountId } = await makeConnectedAccount();

      const historyPrototype = Object.getPrototypeOf(
        google.gmail({ version: 'v1', auth: new google.auth.OAuth2() }).users.history,
      );
      const listSpy = vi.spyOn(historyPrototype, 'list');

      await handleGmailPushNotification({ emailAddress: 'founder@example.com', historyId: '150' });

      expect(listSpy).not.toHaveBeenCalled();
      const { data: account } = await supabase
        .from('connected_accounts')
        .select('sync_cursor')
        .eq('id', connectedAccountId)
        .single()
        .throwOnError();
      expect(account!.sync_cursor).toBe('150');
    });

    it('is a no-op when no connected account matches the notified email address', async () => {
      await expect(
        handleGmailPushNotification({ emailAddress: 'nobody@example.com', historyId: '1' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleGooglePubSubPush', () => {
    it('verifies auth, decodes the envelope, and syncs in one call', async () => {
      const { connectedAccountId } = await makeConnectedAccount();
      vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({ email: 'push@project.iam.gserviceaccount.com' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const data = Buffer.from(
        JSON.stringify({ emailAddress: 'founder@example.com', historyId: '300' }),
      ).toString('base64');
      const request = new Request('https://app.example.com/api/webhooks/google/pubsub', {
        method: 'POST',
        headers: { authorization: 'Bearer good-token' },
        body: JSON.stringify({ message: { data } }),
      });

      const response = await handleGooglePubSubPush(request);
      expect(response.status).toBe(204);

      const { data: account } = await supabase
        .from('connected_accounts')
        .select('sync_cursor')
        .eq('id', connectedAccountId)
        .single()
        .throwOnError();
      expect(account!.sync_cursor).toBe('300');
    });

    it('rejects a push with no auth header before touching the body', async () => {
      const request = new Request('https://app.example.com/api/webhooks/google/pubsub', {
        method: 'POST',
        body: JSON.stringify({ message: {} }),
      });
      await expect(handleGooglePubSubPush(request)).rejects.toThrow(/missing bearer token/i);
    });
  });

  describe('registerGmailWatch / renewGmailWatchesIfNeeded', () => {
    it('registers a watch and stores the historyId/expiration', async () => {
      const { connectedAccountId } = await makeConnectedAccount();
      const watchPrototype = Object.getPrototypeOf(
        google.gmail({ version: 'v1', auth: new google.auth.OAuth2() }).users,
      );
      vi.spyOn(watchPrototype, 'watch').mockResolvedValue({
        data: { historyId: '555', expiration: String(Date.now() + 1000 * 60 * 60) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      await registerGmailWatch(connectedAccountId);

      const { data: account } = await supabase
        .from('connected_accounts')
        .select('sync_cursor, watch_expires_at')
        .eq('id', connectedAccountId)
        .single()
        .throwOnError();
      expect(account!.sync_cursor).toBe('555');
      expect(account!.watch_expires_at).not.toBeNull();
    });

    it('throws a clear error when GOOGLE_PUBSUB_TOPIC is unset', async () => {
      vi.unstubAllEnvs();
      vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
      const { connectedAccountId } = await makeConnectedAccount();
      await expect(registerGmailWatch(connectedAccountId)).rejects.toThrow(
        /GOOGLE_PUBSUB_TOPIC is not configured/,
      );
    });

    it('renews only accounts whose watch is due, skipping accounts not yet due', async () => {
      const { connectedAccountId: dueAccountId } = await makeConnectedAccount('due@example.com');
      const { connectedAccountId: freshAccountId } =
        await makeConnectedAccount('fresh@example.com');

      await supabase
        .from('connected_accounts')
        .update({ watch_expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq('id', dueAccountId)
        .throwOnError();
      await supabase
        .from('connected_accounts')
        .update({
          watch_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 6).toISOString(),
        })
        .eq('id', freshAccountId)
        .throwOnError();

      const watchPrototype = Object.getPrototypeOf(
        google.gmail({ version: 'v1', auth: new google.auth.OAuth2() }).users,
      );
      const watchSpy = vi.spyOn(watchPrototype, 'watch').mockResolvedValue({
        data: { historyId: '999', expiration: String(Date.now() + 1000 * 60 * 60) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const result = await renewGmailWatchesIfNeeded();

      expect(result.renewed).toContain(dueAccountId);
      expect(result.renewed).not.toContain(freshAccountId);
      expect(watchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
