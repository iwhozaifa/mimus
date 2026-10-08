import { exchangeCode, getAuthUrl } from '@/src/server/connectors/microsoft/oauth';
import { ConfidentialClientApplication } from '@azure/msal-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('microsoft oauth', () => {
  beforeEach(() => {
    vi.stubEnv('MICROSOFT_OAUTH_CLIENT_ID', 'test-client-id');
    vi.stubEnv('MICROSOFT_OAUTH_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv(
      'MICROSOFT_OAUTH_REDIRECT_URI',
      'http://localhost:3000/api/connectors/microsoft/callback',
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('requests an auth url with offline_access and the mail+calendar scopes, and a consent prompt', async () => {
    const spy = vi
      .spyOn(ConfidentialClientApplication.prototype, 'getAuthCodeUrl')
      .mockResolvedValue('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?mock=1');

    const url = await getAuthUrl('random-state-value');

    expect(url).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?mock=1');
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: expect.arrayContaining(['Mail.Read', 'Calendars.Read', 'offline_access']),
        redirectUri: 'http://localhost:3000/api/connectors/microsoft/callback',
        state: 'random-state-value',
        prompt: 'consent',
      }),
    );
  });

  it('throws a clear error (not a network call) when Microsoft OAuth env vars are unset', async () => {
    vi.unstubAllEnvs();
    await expect(getAuthUrl('x')).rejects.toThrow(/Microsoft OAuth is not configured/);
  });

  it('exchanges a code for an account email and the serialized token cache, without hitting the real network', async () => {
    vi.spyOn(ConfidentialClientApplication.prototype, 'acquireTokenByCode').mockResolvedValue({
      account: { username: 'founder@example.com' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.spyOn(ConfidentialClientApplication.prototype, 'getTokenCache').mockReturnValue({
      serialize: () => 'serialized-cache-blob',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await exchangeCode('fake-code');
    expect(result).toEqual({
      accountEmail: 'founder@example.com',
      serializedCache: 'serialized-cache-blob',
    });
  });

  it('throws if Microsoft does not return an account for the authorization code', async () => {
    vi.spyOn(ConfidentialClientApplication.prototype, 'acquireTokenByCode').mockResolvedValue({
      account: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expect(exchangeCode('fake-code')).rejects.toThrow(/did not return an account/);
  });
});
