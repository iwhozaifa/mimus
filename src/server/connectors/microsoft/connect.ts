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
}): Promise<ConnectedAccountRow[]> {
  const { accountEmail, serializedCache } = await exchangeCode(params.code);

  const { ciphertext: encryptedCache, keyVersion } = await encryptToken(serializedCache);

  const supabase = createServiceClient();
  const rows: ConnectedAccountRow[] = [];

  for (const accountType of SIBLING_ACCOUNT_TYPES) {
    const { data: account } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: params.workspaceId,
        owner_user_id: params.userId,
        provider: 'microsoft',
        account_type: accountType,
        visibility: 'private',
        external_account_id: accountEmail,
      })
      .select('*')
      .single()
      .throwOnError();

    // encrypted_access_token is left unset for Microsoft rows -- the
    // serialized MSAL cache in encrypted_refresh_token is the only stored
    // credential (see the comment on exchangeCode in oauth.ts).
    await supabase
      .from('connected_account_secrets')
      .insert({
        connected_account_id: account!.id,
        encrypted_refresh_token: bufferToPgBytea(encryptedCache),
        key_version: keyVersion,
      })
      .throwOnError();

    rows.push(account as ConnectedAccountRow);
  }

  return rows;
}
