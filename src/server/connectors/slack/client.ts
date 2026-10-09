import { createServiceClient } from '@/src/db/service';
import { decryptToken, pgByteaToBuffer } from '@/src/server/crypto/tokenVault';
import { WebClient } from '@slack/web-api';

// Builds a WebClient authenticated as the connecting member's own user
// token -- every call made through this client is scoped to exactly what
// that member can see in Slack, which is the entire AI permission
// boundary for this connector (see the architecture doc's "Slack is the
// one connector the AI never calls directly" note).
export async function getAuthorizedClient(connectedAccountId: string): Promise<WebClient> {
  const supabase = createServiceClient();
  const { data: secret, error } = await supabase
    .from('connected_account_secrets')
    .select('encrypted_access_token, key_version')
    .eq('connected_account_id', connectedAccountId)
    .single();
  if (error) throw error;
  if (!secret.encrypted_access_token || secret.key_version == null) {
    throw new Error(`No stored Slack credentials for connected account ${connectedAccountId}`);
  }

  const accessToken = await decryptToken(
    pgByteaToBuffer(secret.encrypted_access_token as string),
    secret.key_version,
  );
  return new WebClient(accessToken);
}
