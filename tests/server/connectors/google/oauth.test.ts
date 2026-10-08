import {
  exchangeCode,
  getAuthenticatedEmail,
  getAuthUrl,
  refreshAccessToken,
  revokeToken,
} from '@/src/server/connectors/google/oauth';
import { google } from 'googleapis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('google oauth', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('GOOGLE_OAUTH_REDIRECT_URI', 'http://localhost:3000/api/connectors/google/callback');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('builds an auth url with offline access, consent prompt, and the gmail+calendar scopes', () => {
    const url = getAuthUrl('random-state-value');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
    expect(parsed.searchParams.get('state')).toBe('random-state-value');
    expect(parsed.searchParams.get('scope')).toContain('gmail.readonly');
    expect(parsed.searchParams.get('scope')).toContain('calendar.readonly');
  });

  it('throws a clear error (not a network call) when Google OAuth env vars are unset', () => {
    vi.unstubAllEnvs();
    expect(() => getAuthUrl('x')).toThrow(/Google OAuth is not configured/);
  });

  it('exchanges a code for tokens without hitting the real network', async () => {
    vi.spyOn(google.auth.OAuth2.prototype, 'getToken').mockResolvedValue({
      tokens: {
        access_token: 'access-123',
        refresh_token: 'refresh-123',
        expiry_date: 1234567890,
        scope: 'a b',
      },
      res: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await exchangeCode('fake-code');
    expect(result).toEqual({
      accessToken: 'access-123',
      refreshToken: 'refresh-123',
      expiryDate: 1234567890,
      scope: 'a b',
    });
  });

  it('refreshes an access token, falling back to the given refresh token if Google omits one', async () => {
    vi.spyOn(google.auth.OAuth2.prototype, 'refreshAccessToken').mockResolvedValue({
      credentials: { access_token: 'access-456', expiry_date: 999, scope: 'a b' },
      res: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await refreshAccessToken('refresh-123');
    expect(result.accessToken).toBe('access-456');
    expect(result.refreshToken).toBe('refresh-123');
  });

  it('revokes a token', async () => {
    const spy = vi
      .spyOn(google.auth.OAuth2.prototype, 'revokeToken')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValue({} as any);
    await revokeToken('access-123');
    expect(spy).toHaveBeenCalledWith('access-123');
  });

  it('resolves the authenticated account email via the Gmail profile endpoint', async () => {
    const gmailUsersPrototype = Object.getPrototypeOf(
      google.gmail({ version: 'v1', auth: new google.auth.OAuth2() }).users,
    );
    vi.spyOn(gmailUsersPrototype, 'getProfile').mockResolvedValue({
      data: { emailAddress: 'someone@example.com' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const email = await getAuthenticatedEmail('access-123');
    expect(email).toBe('someone@example.com');
  });

  it('throws if Google returns a profile with no email address', async () => {
    const gmailUsersPrototype = Object.getPrototypeOf(
      google.gmail({ version: 'v1', auth: new google.auth.OAuth2() }).users,
    );
    vi.spyOn(gmailUsersPrototype, 'getProfile').mockResolvedValue({
      data: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expect(getAuthenticatedEmail('access-123')).rejects.toThrow(/did not return an email/);
  });
});
