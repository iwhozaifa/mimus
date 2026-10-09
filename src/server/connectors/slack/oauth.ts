import { WebClient } from '@slack/web-api';

// Read-only, no-DM scopes requested on the *user* token, never the bot
// token -- Mimus never posts as a bot, and the AI only ever sees content
// the connecting member could see themselves. No im:*/mpim:* scope is
// requested here, so Slack never grants this token visibility into direct
// or group-direct messages at all (see the milestone plan's "no DMs"
// requirement -- enforced by what we ask for, not by filtering results).
const USER_SCOPES = ['channels:history', 'channels:read', 'groups:history', 'groups:read'];

// The bot token is only ever used to list a channel's members, so Events
// API ingestion can tell which connected members may see a notification
// (see events.ts). No chat:* scope, so it can't post; no im:*/mpim:*
// scope, so it can't see DMs either.
const BOT_SCOPES = ['channels:read', 'groups:read'];

export interface ExchangedSlackTokens {
  accessToken: string;
  slackUserId: string;
  teamId: string;
  teamName: string | null;
  // e.g. "acme.slack.com" -- shown beside the team name so two workspaces
  // with similar names stay distinguishable.
  teamDomain: string | null;
  scope: string | null;
  // The team's own bot token, issued because BOT_SCOPES were requested.
  // Stored per team in slack_installations (see installations.ts).
  botAccessToken: string | null;
  botUserId: string | null;
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

// Lets the connections page show a Connect button only when the
// deployment's Slack app credentials are set.
export function isSlackConfigured(): boolean {
  return createOAuthConfig() !== null;
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
  url.searchParams.set('scope', BOT_SCOPES.join(','));
  url.searchParams.set('user_scope', USER_SCOPES.join(','));
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

// oauth.v2.access is callable on an unauthenticated WebClient -- it's the
// one method whose entire purpose is handing back the token in the first
// place. result.access_token is the team's bot token (BOT_SCOPES above);
// authed_user.access_token is the connecting member's own user token.
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
    teamDomain: await fetchTeamDomain(authedUser.access_token),
    scope: authedUser.scope ?? null,
    botAccessToken: result.access_token ?? null,
    botUserId: result.bot_user_id ?? null,
  };
}

// Only used for the connections page label, so a failure here never
// blocks the connection itself.
async function fetchTeamDomain(userAccessToken: string): Promise<string | null> {
  try {
    const { url } = await new WebClient(userAccessToken).auth.test();
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
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
