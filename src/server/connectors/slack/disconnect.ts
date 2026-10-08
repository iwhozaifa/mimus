import { createServiceClient } from '@/src/db/service';
import { revokeToken } from '@/src/server/connectors/slack/oauth';
import { decryptToken, pgByteaToBuffer } from '@/src/server/crypto/tokenVault';

// No sibling-row fan-out needed (see connect.ts) -- disconnecting always
// revokes exactly this one token and purges exactly this one
// connected_account's content. Slack never produces calendar events, so
// unlike Google/Microsoft's disconnect there's no events row to purge.
export async function disconnectSlackAccount(connectedAccountId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: secret } = await supabase
    .from('connected_account_secrets')
    .select('encrypted_access_token, key_version')
    .eq('connected_account_id', connectedAccountId)
    .maybeSingle();

  if (secret?.encrypted_access_token && secret.key_version != null) {
    const accessToken = await decryptToken(
      pgByteaToBuffer(secret.encrypted_access_token as string),
      secret.key_version,
    );
    await revokeToken(accessToken);
  }

  await supabase
    .from('connected_accounts')
    .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
    .eq('id', connectedAccountId)
    .throwOnError();

  await Promise.all([
    supabase
      .from('messages')
      .delete()
      .eq('connected_account_id', connectedAccountId)
      .throwOnError(),
    supabase.from('people').delete().eq('connected_account_id', connectedAccountId).throwOnError(),
    supabase
      .from('connected_account_secrets')
      .delete()
      .eq('connected_account_id', connectedAccountId)
      .throwOnError(),
  ]);
}
