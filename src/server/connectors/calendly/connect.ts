import { createServiceClient } from '@/src/db/service';
import { exchangeCode } from '@/src/server/connectors/calendly/oauth';
import type { ConnectedAccountRow } from '@/src/server/connectors/types';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';

// One Calendly OAuth grant -> one connected_accounts row (account_type
// 'scheduling'), no sibling-row split (same posture as Slack). Both the
// access and refresh token are stored, unlike Slack -- Calendly access
// tokens expire after 2 hours and genuinely need refreshing (see
// oauth.ts's refreshAccessToken for its token-rotation requirement).
//
// provider_team_id holds the grant's organization URI -- required by
// webhook.ts's registerCalendlyWebhook (a webhook subscription always
// needs its owning organization, regardless of scope), same generic
// column Slack's provider_team_id uses for its own workspace concept.
export async function completeCalendlyConnection(params: {
  workspaceId: string;
  userId: string;
  code: string;
}): Promise<ConnectedAccountRow[]> {
  const tokens = await exchangeCode(params.code);

  const { ciphertext: encryptedAccessToken, keyVersion } = await encryptToken(tokens.accessToken);
  const { ciphertext: encryptedRefreshToken } = await encryptToken(tokens.refreshToken);

  const supabase = createServiceClient();
  const { data: account } = await supabase
    .from('connected_accounts')
    .insert({
      workspace_id: params.workspaceId,
      owner_user_id: params.userId,
      provider: 'calendly',
      account_type: 'scheduling',
      visibility: 'private',
      external_account_id: tokens.ownerUri,
      provider_team_id: tokens.organizationUri,
    })
    .select('*')
    .single()
    .throwOnError();

  await supabase
    .from('connected_account_secrets')
    .insert({
      connected_account_id: account!.id,
      encrypted_access_token: bufferToPgBytea(encryptedAccessToken),
      encrypted_refresh_token: bufferToPgBytea(encryptedRefreshToken),
      key_version: keyVersion,
    })
    .throwOnError();

  return [account as ConnectedAccountRow];
}
