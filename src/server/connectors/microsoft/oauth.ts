import { createServiceClient } from '@/src/db/service';
import {
  bufferToPgBytea,
  decryptToken,
  encryptToken,
  pgByteaToBuffer,
} from '@/src/server/crypto/tokenVault';
import type { AuthUrlOptions } from '@/src/server/connectors/types';
import { writeScopesFor } from '@/src/server/connectors/writeScopes';
import { ConfidentialClientApplication, type ICachePlugin } from '@azure/msal-node';

// Read-only scopes for a normal connect (sending and booking add
// writeScopes.ts's, only when the user allows them), mirroring
// the Google connector. offline_access is requested explicitly so MSAL's
// token cache actually gets a refresh token, not just a short-lived access
// token (unlike Google, MSAL's public API never exposes that refresh token
// directly -- see the module comment on exchangeCode below).
// Exported so client.ts can request the same scopes when silently
// refreshing -- MSAL's acquireTokenSilent() requires the caller to repeat
// the scopes it originally consented to.
export const SCOPES = ['Mail.Read', 'Calendars.Read', 'offline_access'];

// Confirmed against node_modules/@azure/msal-node's actual Configuration
// type rather than assumed: a multi-tenant Entra app (the kind the plan
// calls for) uses the "common" authority segment, which accepts both work/
// school and personal Microsoft accounts.
const DEFAULT_AUTHORITY = 'https://login.microsoftonline.com/common';

function redirectUri(): string {
  return process.env.MICROSOFT_OAUTH_REDIRECT_URI!;
}

// Returns null (never throws) so importing this module never fails in CI or
// local dev where Microsoft credentials aren't configured yet -- only
// actually calling one of the functions below without them does. Mirrors
// google/oauth.ts's createOAuthClient exactly.
function createOAuthClient(cachePlugin?: ICachePlugin) {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret || !process.env.MICROSOFT_OAUTH_REDIRECT_URI) {
    return null;
  }
  return new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: process.env.MICROSOFT_OAUTH_AUTHORITY ?? DEFAULT_AUTHORITY,
    },
    cache: cachePlugin ? { cachePlugin } : undefined,
  });
}

// Exported so client.ts (building a Graph client from a connected account's
// stored cache) doesn't duplicate the env lookup -- mirrors
// google/oauth.ts's requireOAuthClient.
export function requireOAuthClient(cachePlugin?: ICachePlugin) {
  const client = createOAuthClient(cachePlugin);
  if (!client) {
    throw new Error(
      'Microsoft OAuth is not configured (missing MICROSOFT_OAUTH_CLIENT_ID/_CLIENT_SECRET/_REDIRECT_URI)',
    );
  }
  return client;
}

function scopesFor(write?: boolean): string[] {
  return write ? [...SCOPES, ...writeScopesFor('microsoft')] : SCOPES;
}

export async function getAuthUrl(state: string, options: AuthUrlOptions = {}): Promise<string> {
  return requireOAuthClient().getAuthCodeUrl({
    scopes: scopesFor(options.write),
    redirectUri: redirectUri(),
    state,
    prompt: 'consent',
    ...(options.loginHint ? { loginHint: options.loginHint } : {}),
  });
}

export interface ExchangedSession {
  accountEmail: string;
  serializedCache: string;
  // What Microsoft actually granted, which decides whether Mimus can send
  // and book (see writeScopes.ts).
  scopes: string[];
}

// Unlike Google's OAuth2Client, MSAL never hands back a raw refresh-token
// string through its public API (confirmed against
// node_modules/@azure/msal-common's AuthenticationResult type -- there is
// no refreshToken field). The officially supported pattern is to persist
// MSAL's own serialized token cache instead and feed it back in via a
// cachePlugin on every later use; acquireTokenSilent() then transparently
// refreshes and rotates it. So what this connector encrypts and stores in
// connected_account_secrets.encrypted_refresh_token isn't a refresh token --
// it's that whole serialized cache blob, treated as the long-lived
// credential. encrypted_access_token is left unused for Microsoft rows.
export async function exchangeCode(
  code: string,
  options: { write?: boolean } = {},
): Promise<ExchangedSession> {
  const client = requireOAuthClient();
  const result = await client.acquireTokenByCode({
    code,
    scopes: scopesFor(options.write),
    redirectUri: redirectUri(),
  });
  const accountEmail = result.account?.username;
  if (!accountEmail) {
    throw new Error('Microsoft did not return an account for this authorization code');
  }
  return {
    accountEmail,
    serializedCache: client.getTokenCache().serialize(),
    scopes: result.scopes ?? [],
  };
}

// Fans a serialized cache out to every sibling connected_accounts row
// sharing (workspace_id, provider, external_account_id) -- one Microsoft
// OAuth grant produces two rows (email + calendar, see completeMicrosoftConnection),
// both backed by the same underlying MSAL account/cache, so they must never
// drift apart. Exported for client.ts to call when acquireTokenSilent()
// rotates the cache during ordinary API use, not just from this module's
// own refreshAndStoreTokens.
export async function persistSerializedCache(
  connectedAccountId: string,
  serializedCache: string,
): Promise<void> {
  const supabase = createServiceClient();

  const { data: account, error: accountError } = await supabase
    .from('connected_accounts')
    .select('workspace_id, provider, external_account_id')
    .eq('id', connectedAccountId)
    .single();
  if (accountError) throw accountError;

  const { ciphertext, keyVersion } = await encryptToken(serializedCache);

  const { data: siblings, error: siblingsError } = await supabase
    .from('connected_accounts')
    .select('id')
    .eq('workspace_id', account.workspace_id)
    .eq('provider', account.provider)
    .eq('external_account_id', account.external_account_id);
  if (siblingsError) throw siblingsError;

  await Promise.all(
    (siblings ?? []).map((sibling) =>
      supabase
        .from('connected_account_secrets')
        .update({
          encrypted_refresh_token: bufferToPgBytea(ciphertext),
          key_version: keyVersion,
          updated_at: new Date().toISOString(),
        })
        .eq('connected_account_id', sibling.id)
        .throwOnError(),
    ),
  );
}

// On-demand refresh (e.g. after a Graph API 401), forcing past whatever MSAL
// has cached. Ordinary API use (client.ts) refreshes transparently via
// acquireTokenSilent() without needing this -- this exists because the
// Connector interface requires an explicit refreshToken() method.
export async function refreshAndStoreTokens(connectedAccountId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: secret, error: secretError } = await supabase
    .from('connected_account_secrets')
    .select('encrypted_refresh_token, key_version')
    .eq('connected_account_id', connectedAccountId)
    .single();
  if (secretError) throw secretError;
  if (!secret.encrypted_refresh_token || secret.key_version == null) {
    throw new Error(`No stored Microsoft credentials for connected account ${connectedAccountId}`);
  }

  const storedCache = await decryptToken(
    pgByteaToBuffer(secret.encrypted_refresh_token as string),
    secret.key_version,
  );

  // Only beforeCacheAccess is needed here -- unlike client.ts (which
  // avoids a DB write on every single Graph call by only persisting when
  // afterCacheAccess reports a change), this is already a one-shot forced
  // refresh, so just re-serializing the cache once afterwards is simpler
  // and exactly as efficient.
  const cachePlugin: ICachePlugin = {
    async beforeCacheAccess(context) {
      context.cache.deserialize(storedCache);
    },
    async afterCacheAccess() {},
  };

  const client = requireOAuthClient(cachePlugin);
  const [account] = await client.getTokenCache().getAllAccounts();
  if (!account) {
    throw new Error(`No cached Microsoft account for connected account ${connectedAccountId}`);
  }

  await client.acquireTokenSilent({ account, scopes: SCOPES, forceRefresh: true });
  await persistSerializedCache(connectedAccountId, client.getTokenCache().serialize());
}
