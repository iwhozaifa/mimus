import { createServiceClient } from '@/src/db/service';
import {
  bufferToPgBytea,
  decryptToken,
  encryptToken,
  pgByteaToBuffer,
} from '@/src/server/crypto/tokenVault';
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

// App-level credentials, set once per deployment by whoever runs Mimus --
// end users never supply them; they only click Connect and approve on
// Google's consent screen.
export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

// Returns null (never throws) so importing this module never fails in CI
// or local dev where Google credentials aren't configured yet -- only
// actually calling one of the functions below without them does.
function createOAuthClient() {
  if (!isGoogleConfigured()) {
    return null;
  }
  return new google.auth.OAuth2({
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
  });
}

// Exported so other Google-connector modules (client.ts, building an
// authenticated API client from a connected account's stored tokens) can
// get a correctly-configured OAuth2Client without duplicating the
// clientId/clientSecret/redirectUri env lookup.
export function requireOAuthClient() {
  const client = createOAuthClient();
  if (!client) {
    throw new Error(
      'Google OAuth is not configured (missing GOOGLE_OAUTH_CLIENT_ID/_CLIENT_SECRET/_REDIRECT_URI)',
    );
  }
  return client;
}

// Returns a Promise only to satisfy the shared Connector interface
// (Microsoft's MSAL client genuinely needs one) -- this one never actually
// awaits anything.
export async function getAuthUrl(state: string): Promise<string> {
  return requireOAuthClient().generateAuthUrl({
    access_type: 'offline',
    // select_account always shows Google's account chooser, so a user
    // signed in to several Google accounts can connect each of them in
    // turn; consent guarantees a refresh token on every connect.
    prompt: 'select_account consent',
    include_granted_scopes: true,
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

// On-demand refresh (e.g. after a provider API 401) -- fans the new token
// pair out to every still-active sibling connected_accounts row sharing
// (workspace_id, owner_user_id, provider, external_account_id), since one Google OAuth
// grant produces two rows (email + calendar) whose tokens must never
// drift apart.
export async function refreshAndStoreTokens(connectedAccountId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: account, error: accountError } = await supabase
    .from('connected_accounts')
    .select('workspace_id, owner_user_id, provider, external_account_id')
    .eq('id', connectedAccountId)
    .single();
  if (accountError) throw accountError;

  const { data: secret, error: secretError } = await supabase
    .from('connected_account_secrets')
    .select('encrypted_refresh_token, key_version')
    .eq('connected_account_id', connectedAccountId)
    .single();
  if (secretError) throw secretError;
  if (!secret.encrypted_refresh_token || secret.key_version == null) {
    throw new Error(`No stored refresh token for connected account ${connectedAccountId}`);
  }

  const currentRefreshToken = await decryptToken(
    pgByteaToBuffer(secret.encrypted_refresh_token as string),
    secret.key_version,
  );

  const refreshed = await refreshAccessToken(currentRefreshToken);

  const { ciphertext: encryptedAccessToken, keyVersion } = await encryptToken(
    refreshed.accessToken,
  );
  // refreshAccessToken() above always falls back to the given refresh
  // token when Google omits a new one, so this is never actually null.
  const { ciphertext: encryptedRefreshToken } = await encryptToken(refreshed.refreshToken!);

  const { data: siblings, error: siblingsError } = await supabase
    .from('connected_accounts')
    .select('id')
    .eq('workspace_id', account.workspace_id)
    .eq('owner_user_id', account.owner_user_id)
    .eq('provider', account.provider)
    .eq('external_account_id', account.external_account_id)
    .neq('status', 'disconnected');
  if (siblingsError) throw siblingsError;

  await Promise.all(
    (siblings ?? []).map((sibling) =>
      supabase
        .from('connected_account_secrets')
        .update({
          encrypted_access_token: bufferToPgBytea(encryptedAccessToken),
          encrypted_refresh_token: bufferToPgBytea(encryptedRefreshToken),
          key_version: keyVersion,
          updated_at: new Date().toISOString(),
        })
        .eq('connected_account_id', sibling.id)
        .throwOnError(),
    ),
  );
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
