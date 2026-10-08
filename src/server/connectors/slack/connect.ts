import { createServiceClient } from '@/src/db/service';
import { exchangeCode } from '@/src/server/connectors/slack/oauth';
import type { ConnectedAccountRow } from '@/src/server/connectors/types';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';

// One Slack OAuth grant -> one connected_accounts row (account_type
// 'slack') -- unlike Google/Microsoft there's no sibling-row split, since
// Slack is a single capability here, not email+calendar. Only the user
// access token is stored; Slack's default OAuth v2 grant issues no
// refresh token at all (see oauth.ts's refreshToken for why).
//
// The grant's team id (which Slack workspace this is) isn't persisted yet
// -- nothing in this task needs it. It becomes load-bearing in the Events
// API ingestion task, which will add wherever it ends up living then.
export async function completeSlackConnection(params: {
  workspaceId: string;
  userId: string;
  code: string;
}): Promise<ConnectedAccountRow[]> {
  const tokens = await exchangeCode(params.code);

  const { ciphertext: encryptedAccessToken, keyVersion } = await encryptToken(tokens.accessToken);

  const supabase = createServiceClient();
  const { data: account } = await supabase
    .from('connected_accounts')
    .insert({
      workspace_id: params.workspaceId,
      owner_user_id: params.userId,
      provider: 'slack',
      account_type: 'slack',
      visibility: 'private',
      external_account_id: tokens.slackUserId,
      scopes: tokens.scope ? tokens.scope.split(',') : null,
    })
    .select('*')
    .single()
    .throwOnError();

  await supabase
    .from('connected_account_secrets')
    .insert({
      connected_account_id: account!.id,
      encrypted_access_token: bufferToPgBytea(encryptedAccessToken),
      key_version: keyVersion,
    })
    .throwOnError();

  return [account as ConnectedAccountRow];
}
