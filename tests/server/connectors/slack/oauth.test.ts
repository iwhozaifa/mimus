import { exchangeCode, getAuthUrl, revokeToken } from '@/src/server/connectors/slack/oauth';
import { WebClient } from '@slack/web-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('slack oauth', () => {
  beforeEach(() => {
    vi.stubEnv('SLACK_CLIENT_ID', 'test-client-id');
    vi.stubEnv('SLACK_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('SLACK_OAUTH_REDIRECT_URI', 'http://localhost:3000/api/connectors/slack/callback');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('builds an auth url requesting only the no-DM read scopes on the user token', async () => {
    const url = await getAuthUrl('random-state-value');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://slack.com/oauth/v2/authorize');
    expect(parsed.searchParams.get('state')).toBe('random-state-value');
    const scopes = parsed.searchParams.get('user_scope')!.split(',');
    expect(scopes).toEqual(
      expect.arrayContaining([
        'channels:history',
        'channels:read',
        'groups:history',
        'groups:read',
      ]),
    );
    expect(scopes.some((s) => s.startsWith('im:') || s.startsWith('mpim:'))).toBe(false);
  });

  it('throws a clear error (not a network call) when Slack OAuth env vars are unset', async () => {
    vi.unstubAllEnvs();
    await expect(getAuthUrl('x')).rejects.toThrow(/Slack OAuth is not configured/);
  });

  it('exchanges a code for the authed user token, slack user id, and team id', async () => {
    vi.spyOn(WebClient.prototype, 'apiCall').mockResolvedValue({
      ok: true,
      authed_user: {
        id: 'U123',
        access_token: 'xoxp-123',
        scope: 'channels:history,channels:read',
      },
      team: { id: 'T123', name: 'Acme' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await exchangeCode('fake-code');
    expect(result).toEqual({
      accessToken: 'xoxp-123',
      slackUserId: 'U123',
      teamId: 'T123',
      teamName: 'Acme',
      scope: 'channels:history,channels:read',
    });
  });

  it('throws if Slack does not return a user access token (scopes denied)', async () => {
    vi.spyOn(WebClient.prototype, 'apiCall').mockResolvedValue({
      ok: true,
      authed_user: { id: 'U123' },
      team: { id: 'T123', name: 'Acme' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expect(exchangeCode('fake-code')).rejects.toThrow(/did not return a user access token/);
  });

  it('revokes a token', async () => {
    const spy = vi
      .spyOn(WebClient.prototype, 'apiCall')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValue({ ok: true } as any);
    await revokeToken('xoxp-123');
    expect(spy.mock.calls[0]?.[0]).toBe('auth.revoke');
  });
});
