import { createServiceClient } from '@/src/db/service';
import { disconnectCalendlyAccount } from '@/src/server/connectors/calendly/disconnect';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';
import { upsertEvent } from '@/src/server/shared/normalize';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('disconnectCalendlyAccount', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.stubEnv('CALENDLY_CLIENT_ID', 'test-client-id');
    vi.stubEnv('CALENDLY_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv(
      'CALENDLY_OAUTH_REDIRECT_URI',
      'http://localhost:3000/api/connectors/calendly/callback',
    );
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
      .insert({ name: 'Calendly disconnect test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Calendly disconnect test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `calendly-disconnect-${userId}@example.com`,
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

    return { workspaceId: workspace!.id as string, connectedAccountId: account!.id as string };
  }

  it('revokes the token, purges events/people, deletes the secret, and marks disconnected', async () => {
    const { workspaceId, connectedAccountId } = await makeConnectedAccount();
    await upsertEvent(workspaceId, connectedAccountId, {
      providerEventId: 'https://api.calendly.com/scheduled_events/xyz',
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
    });

    // Only intercepts calls to Calendly's own API -- everything else
    // (the real local Supabase REST calls disconnectCalendlyAccount and
    // this test's own assertions make) must pass through untouched,
    // since supabase-js shares this same global fetch.
    const realFetch = globalThis.fetch;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) =>
        String(input).includes('calendly.com')
          ? new Response(null, { status: 200 })
          : realFetch(input, init),
      );

    await disconnectCalendlyAccount(connectedAccountId);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://auth.calendly.com/oauth/revoke',
      expect.objectContaining({ method: 'POST' }),
    );

    const { data: account } = await supabase
      .from('connected_accounts')
      .select('status, disconnected_at')
      .eq('id', connectedAccountId)
      .single()
      .throwOnError();
    expect(account!.status).toBe('disconnected');
    expect(account!.disconnected_at).not.toBeNull();

    const { data: events } = await supabase
      .from('events')
      .select('id')
      .eq('connected_account_id', connectedAccountId)
      .throwOnError();
    expect(events).toHaveLength(0);

    const { data: secret } = await supabase
      .from('connected_account_secrets')
      .select('connected_account_id')
      .eq('connected_account_id', connectedAccountId)
      .maybeSingle()
      .throwOnError();
    expect(secret).toBeNull();
  });
});
