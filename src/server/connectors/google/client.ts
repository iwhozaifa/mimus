import { createServiceClient } from '@/src/db/service';
import { requireOAuthClient } from '@/src/server/connectors/google/oauth';
import { decryptToken, pgByteaToBuffer } from '@/src/server/crypto/tokenVault';

// Builds an OAuth2Client carrying a connected account's decrypted tokens,
// for connector code (backfill, poll, webhook handling) that needs to call
// the Gmail/Calendar APIs on that account's behalf. No network call
// happens here -- googleapis only talks to Google once an API method is
// actually invoked against the returned client.
export async function getAuthorizedClient(connectedAccountId: string) {
  const supabase = createServiceClient();
  const { data: secret, error } = await supabase
    .from('connected_account_secrets')
    .select('encrypted_access_token, encrypted_refresh_token, key_version')
    .eq('connected_account_id', connectedAccountId)
    .single();
  if (error) throw error;
  if (
    !secret.encrypted_access_token ||
    !secret.encrypted_refresh_token ||
    secret.key_version == null
  ) {
    throw new Error(`No stored Google credentials for connected account ${connectedAccountId}`);
  }

  const [accessToken, refreshToken] = await Promise.all([
    decryptToken(pgByteaToBuffer(secret.encrypted_access_token as string), secret.key_version),
    decryptToken(pgByteaToBuffer(secret.encrypted_refresh_token as string), secret.key_version),
  ]);

  const client = requireOAuthClient();
  client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return client;
}
