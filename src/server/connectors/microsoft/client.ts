import { createServiceClient } from '@/src/db/service';
import {
  SCOPES,
  persistSerializedCache,
  requireOAuthClient,
} from '@/src/server/connectors/microsoft/oauth';
import { decryptToken, pgByteaToBuffer } from '@/src/server/crypto/tokenVault';
import { Client } from '@microsoft/microsoft-graph-client';
import type { ICachePlugin } from '@azure/msal-node';

// Builds a Graph client carrying a connected account's cached MSAL session,
// for connector code (backfill, poll) that needs to call the Graph API on
// that account's behalf. Unlike Google's getAuthorizedClient(), the
// authProvider callback below defers acquireTokenSilent() until Graph
// actually issues a request -- so, same as Google, no network call happens
// just from calling this function.
export async function getAuthorizedGraphClient(connectedAccountId: string): Promise<Client> {
  const supabase = createServiceClient();
  const { data: secret, error } = await supabase
    .from('connected_account_secrets')
    .select('encrypted_refresh_token, key_version')
    .eq('connected_account_id', connectedAccountId)
    .single();
  if (error) throw error;
  if (!secret.encrypted_refresh_token || secret.key_version == null) {
    throw new Error(`No stored Microsoft credentials for connected account ${connectedAccountId}`);
  }

  let latestCache = await decryptToken(
    pgByteaToBuffer(secret.encrypted_refresh_token as string),
    secret.key_version,
  );

  // acquireTokenSilent() rotates the cached refresh token under the hood
  // whenever it refreshes an expired access token -- this plugin persists
  // that rotation back to the DB (fanned out to sibling rows) so the next
  // call doesn't start from a stale cache.
  const cachePlugin: ICachePlugin = {
    async beforeCacheAccess(context) {
      context.cache.deserialize(latestCache);
    },
    async afterCacheAccess(context) {
      if (context.cacheHasChanged) {
        latestCache = context.cache.serialize();
        await persistSerializedCache(connectedAccountId, latestCache);
      }
    },
  };

  const msalClient = requireOAuthClient(cachePlugin);
  const [account] = await msalClient.getTokenCache().getAllAccounts();
  if (!account) {
    throw new Error(`No cached Microsoft account for connected account ${connectedAccountId}`);
  }

  return Client.init({
    authProvider: (done) => {
      msalClient
        .acquireTokenSilent({ account, scopes: SCOPES })
        .then((result) => done(null, result.accessToken))
        .catch((err) => done(err, null));
    },
  });
}
