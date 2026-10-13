import { createServiceClient } from '@/src/db/service';
import { completeCalendlyConnection } from '@/src/server/connectors/calendly/connect';
import { pgByteaToBuffer } from '@/src/server/crypto/tokenVault';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/server/connectors/calendly/oauth', () => ({
  exchangeCode: vi.fn(),
}));

import { exchangeCode } from '@/src/server/connectors/calendly/oauth';

describe('completeCalendlyConnection', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    vi.mocked(exchangeCode).mockResolvedValue({
      accessToken: 'access-123',
      refreshToken: 'refresh-123',
      expiresIn: 7200,
      ownerUri: 'https://api.calendly.com/users/abc',
      organizationUri: 'https://api.calendly.com/organizations/def',
    });
    // Never reach the real Calendly API from a test.
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
      String(input).startsWith('https://api.calendly.com/')
        ? new Response('not stubbed', { status: 500 })
        : realFetch(input, init),
    );
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await Promise.all(createdUserIds.map((id) => supabase.auth.admin.deleteUser(id)));
    createdUserIds.length = 0;
  });

  async function makeWorkspace() {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Calendly connect test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Calendly connect test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `calendly-connect-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);
    return { workspaceId: workspace!.id as string, userId };
  }

  it('creates one connected_accounts row with encrypted access+refresh tokens', async () => {
    const { workspaceId, userId } = await makeWorkspace();

    const rows = await completeCalendlyConnection({ workspaceId, userId, code: 'fake-code' });

    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.provider).toBe('calendly');
    expect(row.account_type).toBe('scheduling');
    expect(row.external_account_id).toBe('https://api.calendly.com/users/abc');
    expect(row.provider_team_id).toBe('https://api.calendly.com/organizations/def');
    expect(row.visibility).toBe('private');
    expect(row.status).toBe('connected');

    const { data: secret } = await supabase
      .from('connected_account_secrets')
      .select('*')
      .eq('connected_account_id', row.id)
      .single();
    expect(secret?.key_version).toBe(1);
    const storedAccess = pgByteaToBuffer(secret!.encrypted_access_token as string);
    expect(storedAccess.toString('utf8')).not.toContain('access-123');
    const storedRefresh = pgByteaToBuffer(secret!.encrypted_refresh_token as string);
    expect(storedRefresh.toString('utf8')).not.toContain('refresh-123');
  });

  it('stores the user’s Calendly scheduling link, read from /users/me', async () => {
    const realFetch = vi.mocked(globalThis.fetch).getMockImplementation()!;
    const fetchSpy = vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === 'https://api.calendly.com/users/me') {
        return Response.json({ resource: { scheduling_url: 'https://calendly.com/founder' } });
      }
      return realFetch(input, init);
    });
    const { workspaceId, userId } = await makeWorkspace();

    const [row] = await completeCalendlyConnection({ workspaceId, userId, code: 'fake-code' });

    const { data } = await supabase
      .from('connected_accounts')
      .select('scheduling_url')
      .eq('id', row.id)
      .single()
      .throwOnError();
    expect(data!.scheduling_url).toBe('https://calendly.com/founder');
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('still connects when the scheduling link can’t be read', async () => {
    const realFetch = vi.mocked(globalThis.fetch).getMockImplementation()!;
    const fetchSpy = vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      if (String(input) === 'https://api.calendly.com/users/me') {
        return new Response('forbidden', { status: 403 });
      }
      return realFetch(input, init);
    });
    const { workspaceId, userId } = await makeWorkspace();

    const [row] = await completeCalendlyConnection({ workspaceId, userId, code: 'fake-code' });

    expect(row.status).toBe('connected');
    expect(fetchSpy).toHaveBeenCalled();
  });
});
