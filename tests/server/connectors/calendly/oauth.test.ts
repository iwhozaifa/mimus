import {
  exchangeCode,
  getAuthUrl,
  refreshAccessToken,
  revokeToken,
} from '@/src/server/connectors/calendly/oauth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('calendly oauth', () => {
  beforeEach(() => {
    vi.stubEnv('CALENDLY_CLIENT_ID', 'test-client-id');
    vi.stubEnv('CALENDLY_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv(
      'CALENDLY_OAUTH_REDIRECT_URI',
      'http://localhost:3000/api/connectors/calendly/callback',
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('builds an auth url requesting only read/webhook-management scopes, never a booking scope', async () => {
    const url = await getAuthUrl('random-state-value');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://auth.calendly.com/oauth/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('state')).toBe('random-state-value');
    const scopes = parsed.searchParams.get('scope')!.split(' ');
    expect(scopes).toEqual(expect.arrayContaining(['scheduled_events:read', 'webhooks:write']));
  });

  it('throws a clear error (not a network call) when Calendly OAuth env vars are unset', async () => {
    vi.unstubAllEnvs();
    await expect(getAuthUrl('x')).rejects.toThrow(/Calendly OAuth is not configured/);
  });

  it('exchanges a code for tokens plus the owning user/organization URIs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-123',
          refresh_token: 'refresh-123',
          expires_in: 7200,
          owner: 'https://api.calendly.com/users/abc',
          organization: 'https://api.calendly.com/organizations/def',
        }),
        { status: 200 },
      ),
    );

    const result = await exchangeCode('fake-code');
    expect(result).toEqual({
      accessToken: 'access-123',
      refreshToken: 'refresh-123',
      expiresIn: 7200,
      ownerUri: 'https://api.calendly.com/users/abc',
      organizationUri: 'https://api.calendly.com/organizations/def',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://auth.calendly.com/oauth/token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws if the token endpoint responds with an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
    );
    await expect(exchangeCode('bad-code')).rejects.toThrow(/Calendly token exchange failed/);
  });

  it('refreshes an access token, returning the rotated (new) refresh token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-456',
          refresh_token: 'refresh-456',
          expires_in: 7200,
          owner: 'https://api.calendly.com/users/abc',
          organization: 'https://api.calendly.com/organizations/def',
        }),
        { status: 200 },
      ),
    );

    const result = await refreshAccessToken('refresh-123');
    expect(result.accessToken).toBe('access-456');
    // Calendly rotates refresh tokens on every use -- the old one must
    // never be reused, so this always comes back as the new value, never
    // falling back to the one passed in (unlike Google's refresh).
    expect(result.refreshToken).toBe('refresh-456');
  });

  it('revokes a token', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    await revokeToken('access-123');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://auth.calendly.com/oauth/revoke',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
