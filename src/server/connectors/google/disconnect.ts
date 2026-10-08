import { createServiceClient } from '@/src/db/service';
import { revokeToken } from '@/src/server/connectors/google/oauth';
import { decryptToken, pgByteaToBuffer } from '@/src/server/crypto/tokenVault';

// One Google OAuth grant backs two sibling connected_accounts rows
// (email + calendar) sharing one token pair, so the provider token is
// only revoked once no sibling row is still connected -- disconnecting
// one sibling must leave the other's access untouched. Each sibling's
// own content (messages/events/people) and secrets are purged
// regardless, since those are scoped to this one connected_account_id.
export async function disconnectGoogleAccount(connectedAccountId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: account, error: accountError } = await supabase
    .from('connected_accounts')
    .select('workspace_id, provider, external_account_id')
    .eq('id', connectedAccountId)
    .single();
  if (accountError) throw accountError;

  const { data: siblings, error: siblingsError } = await supabase
    .from('connected_accounts')
    .select('id, status')
    .eq('workspace_id', account.workspace_id)
    .eq('provider', account.provider)
    .eq('external_account_id', account.external_account_id);
  if (siblingsError) throw siblingsError;

  const otherSiblingStillConnected = (siblings ?? []).some(
    (sibling) => sibling.id !== connectedAccountId && sibling.status !== 'disconnected',
  );

  if (!otherSiblingStillConnected) {
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
    supabase.from('events').delete().eq('connected_account_id', connectedAccountId).throwOnError(),
    supabase.from('people').delete().eq('connected_account_id', connectedAccountId).throwOnError(),
    supabase
      .from('connected_account_secrets')
      .delete()
      .eq('connected_account_id', connectedAccountId)
      .throwOnError(),
  ]);
}
