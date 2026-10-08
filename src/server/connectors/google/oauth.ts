import { google } from 'googleapis';

// Read-only scopes only -- V1 never sends on the user's behalf. Covers
// both account_type rows (email, calendar) a single Google OAuth grant
// produces (see the two-sibling-rows design decision in the milestone
// plan).
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiryDate: number | null;
  scope: string | null;
}

// Returns null (never throws) so importing this module never fails in CI
// or local dev where Google credentials aren't configured yet -- only
// actually calling one of the functions below without them does.
function createOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return new google.auth.OAuth2({ clientId, clientSecret, redirectUri });
}

function requireOAuthClient() {
  const client = createOAuthClient();
  if (!client) {
    throw new Error(
      'Google OAuth is not configured (missing GOOGLE_OAUTH_CLIENT_ID/_CLIENT_SECRET/_REDIRECT_URI)',
    );
  }
  return client;
}

export function getAuthUrl(state: string): string {
  return requireOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

export async function exchangeCode(code: string): Promise<ExchangedTokens> {
  const { tokens } = await requireOAuthClient().getToken(code);
  return {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate: tokens.expiry_date ?? null,
    scope: tokens.scope ?? null,
  };
}

// Google doesn't always return a new refresh_token on refresh -- fall
// back to the one we already had so callers never lose it.
export async function refreshAccessToken(refreshToken: string): Promise<ExchangedTokens> {
  const client = requireOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  return {
    accessToken: credentials.access_token!,
    refreshToken: credentials.refresh_token ?? refreshToken,
    expiryDate: credentials.expiry_date ?? null,
    scope: credentials.scope ?? null,
  };
}

export async function revokeToken(token: string): Promise<void> {
  await requireOAuthClient().revokeToken(token);
}

// No 'email'/'profile'/'openid' scope is requested (see SCOPES above), so
// identifying which Google account just connected goes through the Gmail
// profile endpoint instead, which gmail.readonly already grants.
export async function getAuthenticatedEmail(accessToken: string): Promise<string> {
  const client = requireOAuthClient();
  client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: client });
  const { data } = await gmail.users.getProfile({ userId: 'me' });
  if (!data.emailAddress) {
    throw new Error('Google did not return an email address for this account');
  }
  return data.emailAddress;
}
