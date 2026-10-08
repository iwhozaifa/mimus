import { WebClient } from '@slack/web-api';

// Read-only, no-DM scopes requested on the *user* token, never the bot
// token -- Mimus never posts as a bot, and the AI only ever sees content
// the connecting member could see themselves. No im:*/mpim:* scope is
// requested here, so Slack never grants this token visibility into direct
// or group-direct messages at all (see the milestone plan's "no DMs"
// requirement -- enforced by what we ask for, not by filtering results).
const USER_SCOPES = ['channels:history', 'channels:read', 'groups:history', 'groups:read'];

export interface ExchangedSlackTokens {
  accessToken: string;
  slackUserId: string;
  teamId: string;
  teamName: string | null;
  scope: string | null;
}

// Returns null (never throws) so importing this module never fails in CI
// or local dev where Slack credentials aren't configured yet -- only
// actually calling one of the functions below without them does.
function createOAuthConfig() {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = process.env.SLACK_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

function requireOAuthConfig() {
  const config = createOAuthConfig();
  if (!config) {
    throw new Error(
      'Slack OAuth is not configured (missing SLACK_CLIENT_ID/_CLIENT_SECRET/_OAUTH_REDIRECT_URI)',
    );
  }
  return config;
}

// Returns a Promise only to satisfy the shared Connector interface (see
// Google's getAuthUrl for the same note) -- this one never actually awaits
// anything.
export async function getAuthUrl(state: string): Promise<string> {
  const { clientId, redirectUri } = requireOAuthConfig();
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('user_scope', USER_SCOPES.join(','));
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

// oauth.v2.access is callable on an unauthenticated WebClient -- it's the
// one method whose entire purpose is handing back the token in the first
// place. No bot scopes are requested anywhere in this app, so
// result.access_token (the bot token) is intentionally never read here.
export async function exchangeCode(code: string): Promise<ExchangedSlackTokens> {
  const { clientId, clientSecret, redirectUri } = requireOAuthConfig();
  const client = new WebClient();
  const result = await client.oauth.v2.access({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const authedUser = result.authed_user;
  if (!authedUser?.access_token || !authedUser.id) {
    throw new Error(
      'Slack did not return a user access token -- the user may have denied the requested scopes',
    );
  }
  if (!result.team?.id) {
    throw new Error('Slack did not return a team id');
  }

  return {
    accessToken: authedUser.access_token,
    slackUserId: authedUser.id,
    teamId: result.team.id,
    teamName: result.team.name ?? null,
    scope: authedUser.scope ?? null,
  };
}

export async function revokeToken(accessToken: string): Promise<void> {
  const client = new WebClient(accessToken);
  await client.auth.revoke();
}

// Slack's default OAuth v2 user grant issues no refresh token and the
// access token does not expire -- that only changes if the Slack app
// opts into the separate Token Rotation beta feature, which this app does
// not use. Kept as a documented no-op (not an error) since the standard
// Connector interface requires every provider to implement refreshToken.
export async function refreshToken(): Promise<void> {}
