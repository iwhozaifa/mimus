import { createServiceClient } from '@/src/db/service';
import { exchangeCode, getAuthenticatedEmail } from '@/src/server/connectors/google/oauth';
import type { AccountType, ConnectedAccountRow } from '@/src/server/connectors/types';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';

// One Google OAuth grant -> two sibling connected_accounts rows (email +
// calendar), sharing external_account_id, each with its own independent
// visibility -- reuses the one-row-per-capability schema from Milestone 1
// unchanged (see the milestone plan's design-decisions section).
const SIBLING_ACCOUNT_TYPES: AccountType[] = ['email', 'calendar'];

export async function completeGoogleConnection(params: {
  workspaceId: string;
  userId: string;
  code: string;
}): Promise<ConnectedAccountRow[]> {
  const tokens = await exchangeCode(params.code);
  if (!tokens.refreshToken) {
    throw new Error(
      'Google did not return a refresh token -- the user may need to revoke prior access at https://myaccount.google.com/permissions and reconnect',
    );
  }

  const email = await getAuthenticatedEmail(tokens.accessToken);
  const scopes = tokens.scope ? tokens.scope.split(' ') : null;

  const { ciphertext: encryptedAccessToken, keyVersion } = await encryptToken(tokens.accessToken);
  const { ciphertext: encryptedRefreshToken } = await encryptToken(tokens.refreshToken);

  const supabase = createServiceClient();

  // Reconnecting an address this user already has connected (e.g. after
  // needs_reauth) refreshes those rows in place -- keeping their ids,
  // visibility and synced content -- instead of adding duplicates. A
  // different address gets its own pair of rows, which is what lets one
  // user connect several Google accounts. Google addresses are
  // case-insensitive, hence ilike.
  const { data: existing } = await supabase
    .from('connected_accounts')
    .select('*')
    .eq('workspace_id', params.workspaceId)
    .eq('owner_user_id', params.userId)
    .eq('provider', 'google')
    .ilike('external_account_id', email)
    .neq('status', 'disconnected')
    .throwOnError();

  const secrets = {
    encrypted_access_token: bufferToPgBytea(encryptedAccessToken),
    encrypted_refresh_token: bufferToPgBytea(encryptedRefreshToken),
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
        provider: 'google',
        account_type: accountType,
        visibility: 'private',
        external_account_id: email,
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
