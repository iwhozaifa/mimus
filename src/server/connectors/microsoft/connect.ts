import { createServiceClient } from '@/src/db/service';
import { exchangeCode } from '@/src/server/connectors/microsoft/oauth';
import type { AccountType, ConnectedAccountRow } from '@/src/server/connectors/types';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';

// One Microsoft OAuth grant -> two sibling connected_accounts rows (email +
// calendar), sharing external_account_id, each with its own independent
// visibility -- same rationale as the Google connector even though Graph is
// a single API surface (see the milestone plan's design-decisions section).
const SIBLING_ACCOUNT_TYPES: AccountType[] = ['email', 'calendar'];

export async function completeMicrosoftConnection(params: {
  workspaceId: string;
  userId: string;
  code: string;
  write?: boolean;
}): Promise<ConnectedAccountRow[]> {
  const { accountEmail, serializedCache, scopes } = await exchangeCode(params.code, {
    write: params.write,
  });

  const { ciphertext: encryptedCache, keyVersion } = await encryptToken(serializedCache);

  const supabase = createServiceClient();

  // Reconnecting an address this user already has connected (after
  // needs_reauth, or to allow sending and booking) refreshes those rows in
  // place -- keeping their ids, visibility and synced content -- the same
  // way the Google connector does. Addresses are case-insensitive.
  const { data: existing } = await supabase
    .from('connected_accounts')
    .select('*')
    .eq('workspace_id', params.workspaceId)
    .eq('owner_user_id', params.userId)
    .eq('provider', 'microsoft')
    .ilike('external_account_id', accountEmail)
    .neq('status', 'disconnected')
    .throwOnError();

  // encrypted_access_token is left unset for Microsoft rows -- the
  // serialized MSAL cache in encrypted_refresh_token is the only stored
  // credential (see the comment on exchangeCode in oauth.ts).
  const secrets = {
    encrypted_refresh_token: bufferToPgBytea(encryptedCache),
    key_version: keyVersion,
  };
  const rows: ConnectedAccountRow[] = [];

  for (const accountType of SIBLING_ACCOUNT_TYPES) {
    const current = (existing ?? []).find((row) => row.account_type === accountType);

    if (current) {
      const { data: account } = await supabase
        .from('connected_accounts')
        .update({ status: 'connected', scopes })
        .eq('id', current.id)
        .select('*')
        .single()
        .throwOnError();

      await supabase
        .from('connected_account_secrets')
        .upsert({
          connected_account_id: current.id,
          ...secrets,
          updated_at: new Date().toISOString(),
        })
        .throwOnError();

      rows.push(account as ConnectedAccountRow);
      continue;
    }

    const { data: account } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: params.workspaceId,
        owner_user_id: params.userId,
        provider: 'microsoft',
        account_type: accountType,
        visibility: 'private',
        external_account_id: accountEmail,
        scopes,
      })
      .select('*')
      .single()
      .throwOnError();

    await supabase
      .from('connected_account_secrets')
      .insert({ connected_account_id: account!.id, ...secrets })
      .throwOnError();

    rows.push(account as ConnectedAccountRow);
  }

  return rows;
}
