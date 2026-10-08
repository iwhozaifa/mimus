import { createServiceClient } from '@/src/db/service';
import {
  bufferToPgBytea,
  decryptToken,
  encryptToken,
  pgByteaToBuffer,
} from '@/src/server/crypto/tokenVault';

// scheduled_events:read lets sync.ts list bookings and invitees;
// webhooks:write is only for managing this connector's own webhook
// subscription (see webhook.ts's registerCalendlyWebhook). No scope that
// can create, reschedule, or cancel a booking is ever requested -- Mimus
// never books through Calendly (see sync.ts's own read-only guarantee).
const SCOPES = ['scheduled_events:read', 'webhooks:write'];

const AUTH_BASE = 'https://auth.calendly.com';

export interface ExchangedCalendlyTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  ownerUri: string;
  organizationUri: string;
}

// Returns null (never throws) so importing this module never fails in CI
// or local dev where Calendly credentials aren't configured yet -- only
// actually calling one of the functions below without them does.
function createOAuthConfig() {
  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
  const redirectUri = process.env.CALENDLY_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

function requireOAuthConfig() {
  const config = createOAuthConfig();
  if (!config) {
    throw new Error(
      'Calendly OAuth is not configured (missing CALENDLY_CLIENT_ID/_CLIENT_SECRET/_OAUTH_REDIRECT_URI)',
    );
  }
  return config;
}

// Returns a Promise only to satisfy the shared Connector interface (see
// Google's getAuthUrl for the same note) -- this one never actually awaits
// anything.
export async function getAuthUrl(state: string): Promise<string> {
  const { clientId, redirectUri } = requireOAuthConfig();
  const url = new URL(`${AUTH_BASE}/oauth/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

interface CalendlyTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  owner: string;
  organization: string;
  error?: string;
  error_description?: string;
}

async function requestToken(body: Record<string, string>): Promise<ExchangedCalendlyTokens> {
  const { clientId, clientSecret } = requireOAuthConfig();
  const response = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }),
  });

  const data = (await response.json()) as CalendlyTokenResponse;
  if (!response.ok) {
    throw new Error(
      `Calendly token exchange failed: ${data.error ?? response.status} ${data.error_description ?? ''}`.trim(),
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    ownerUri: data.owner,
    organizationUri: data.organization,
  };
}

export async function exchangeCode(code: string): Promise<ExchangedCalendlyTokens> {
  const { redirectUri } = requireOAuthConfig();
  return requestToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

// Calendly rotates refresh tokens on every use (its OAuth 2.1 token-replay
// protection) -- the refresh token this returns is always a brand new
// one, and the one passed in is revoked the instant this call succeeds.
// Unlike Google's refresh (which falls back to the old refresh token when
// none is returned), callers here must always persist the new value or
// the next refresh will fail outright.
export async function refreshAccessToken(refreshToken: string): Promise<ExchangedCalendlyTokens> {
  return requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

// No sibling-row fan-out needed (unlike Google's refreshAndStoreTokens) --
// one Calendly connection is always exactly one connected_accounts row.
// Both the access *and* refresh token are overwritten every time, since
// Calendly always rotates both (see refreshAccessToken above).
export async function refreshAndStoreTokens(connectedAccountId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: secret, error } = await supabase
    .from('connected_account_secrets')
    .select('encrypted_refresh_token, key_version')
    .eq('connected_account_id', connectedAccountId)
    .single();
  if (error) throw error;
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
  const { ciphertext: encryptedRefreshToken } = await encryptToken(refreshed.refreshToken);

  await supabase
    .from('connected_account_secrets')
    .update({
      encrypted_access_token: bufferToPgBytea(encryptedAccessToken),
      encrypted_refresh_token: bufferToPgBytea(encryptedRefreshToken),
      key_version: keyVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('connected_account_id', connectedAccountId)
    .throwOnError();
}

export async function revokeToken(accessToken: string): Promise<void> {
  const { clientId, clientSecret } = requireOAuthConfig();
  await fetch(`${AUTH_BASE}/oauth/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token: accessToken,
    }),
  });
}
