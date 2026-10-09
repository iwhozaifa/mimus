import {
  exchangeCode,
  getAuthUrl,
  isSlackConfigured,
  revokeToken,
} from '@/src/server/connectors/slack/oauth';
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

  it('requests only the membership-lookup bot scopes, never posting or DM scopes', async () => {
    const parsed = new URL(await getAuthUrl('state'));
    const botScopes = parsed.searchParams.get('scope')!.split(',');
    expect(botScopes.sort()).toEqual(['channels:read', 'groups:read']);
    const allScopes = [...botScopes, ...parsed.searchParams.get('user_scope')!.split(',')];
    expect(
      allScopes.some((s) => s.startsWith('im:') || s.startsWith('mpim:') || s.startsWith('chat:')),
    ).toBe(false);
  });

  it('isSlackConfigured is true only when all three OAuth vars are set', () => {
    expect(isSlackConfigured()).toBe(true);
    for (const name of ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'SLACK_OAUTH_REDIRECT_URI']) {
      vi.stubEnv(name, '');
      expect(isSlackConfigured()).toBe(false);
      vi.stubEnv(name, 'set');
    }
  });

  it('throws a clear error (not a network call) when Slack OAuth env vars are unset', async () => {
    vi.unstubAllEnvs();
    await expect(getAuthUrl('x')).rejects.toThrow(/Slack OAuth is not configured/);
  });

  it('exchanges a code for the user token, the team bot token, and the team domain', async () => {
    const spy = vi.spyOn(WebClient.prototype, 'apiCall').mockImplementation(async (method) => {
      if (method === 'oauth.v2.access') {
        return {
          ok: true,
          access_token: 'xoxb-bot',
          bot_user_id: 'B123',
          authed_user: {
            id: 'U123',
            access_token: 'xoxp-123',
            scope: 'channels:history,channels:read',
          },
          team: { id: 'T123', name: 'Acme' },
        } as never;
      }
      if (method === 'auth.test') {
        return { ok: true, url: 'https://acme.slack.com/' } as never;
      }
      throw new Error(`unexpected apiCall: ${method}`);
    });

    const result = await exchangeCode('fake-code');
    expect(result).toEqual({
      accessToken: 'xoxp-123',
      slackUserId: 'U123',
      teamId: 'T123',
      teamName: 'Acme',
      teamDomain: 'acme.slack.com',
      scope: 'channels:history,channels:read',
      botAccessToken: 'xoxb-bot',
      botUserId: 'B123',
    });
    expect(spy.mock.calls.map(([method]) => method)).toEqual(['oauth.v2.access', 'auth.test']);
  });

  it('still connects when Slack returns no bot token or auth.test fails', async () => {
    vi.spyOn(WebClient.prototype, 'apiCall').mockImplementation(async (method) => {
      if (method === 'oauth.v2.access') {
        return {
          ok: true,
          authed_user: { id: 'U123', access_token: 'xoxp-123' },
          team: { id: 'T123', name: 'Acme' },
        } as never;
      }
      throw new Error('auth.test unavailable');
    });

    const result = await exchangeCode('fake-code');
    expect(result.botAccessToken).toBeNull();
    expect(result.botUserId).toBeNull();
    expect(result.teamDomain).toBeNull();
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
