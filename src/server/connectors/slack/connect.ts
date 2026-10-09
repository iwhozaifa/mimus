import { createServiceClient } from '@/src/db/service';
import { saveSlackInstallation } from '@/src/server/connectors/slack/installations';
import { exchangeCode } from '@/src/server/connectors/slack/oauth';
import type { ConnectedAccountRow } from '@/src/server/connectors/types';
import { bufferToPgBytea, encryptToken } from '@/src/server/crypto/tokenVault';

// One Slack OAuth grant -> one connected_accounts row (account_type
// 'slack') -- unlike Google/Microsoft there's no sibling-row split, since
// Slack is a single capability here, not email+calendar. Only the user
// access token is stored on the row; Slack's default OAuth v2 grant
// issues no refresh token at all (see oauth.ts's refreshToken for why).
// The same grant also returns that Slack workspace's bot token, which is
// stored once per team in slack_installations (see installations.ts).
//
// provider_team_id (which Slack workspace this is) is what the Events API
// ingestion path uses to find every Mimus member connected to the same
// Slack workspace a given notification came from -- see
// supabase/migrations/0015_connected_accounts_provider_team_id.sql.
export async function completeSlackConnection(params: {
  workspaceId: string;
  userId: string;
  code: string;
}): Promise<ConnectedAccountRow[]> {
  const tokens = await exchangeCode(params.code);

  if (tokens.botAccessToken) {
    await saveSlackInstallation({
      teamId: tokens.teamId,
      teamName: tokens.teamName,
      botToken: tokens.botAccessToken,
      botUserId: tokens.botUserId,
      workspaceId: params.workspaceId,
    });
  }

  const { ciphertext: encryptedAccessToken, keyVersion } = await encryptToken(tokens.accessToken);
  const secret = {
    encrypted_access_token: bufferToPgBytea(encryptedAccessToken),
    key_version: keyVersion,
  };
  const details = {
    scopes: tokens.scope ? tokens.scope.split(',') : null,
    provider_team_name: tokens.teamName,
    provider_team_domain: tokens.teamDomain,
  };

  const supabase = createServiceClient();

  // Reconnecting a Slack workspace this user already has connected (e.g.
  // after needs_reauth) refreshes that row in place -- keeping its id,
  // visibility and synced messages -- instead of adding a duplicate. A
  // different Slack workspace gets its own row, which is what lets one
  // user connect several.
  const { data: existing } = await supabase
    .from('connected_accounts')
    .select('id')
    .eq('workspace_id', params.workspaceId)
    .eq('owner_user_id', params.userId)
    .eq('provider', 'slack')
    .eq('provider_team_id', tokens.teamId)
    .eq('external_account_id', tokens.slackUserId)
    .neq('status', 'disconnected')
    .limit(1)
    .maybeSingle()
    .throwOnError();

  if (existing) {
    const { data: account } = await supabase
      .from('connected_accounts')
      .update({ status: 'connected', ...details })
      .eq('id', existing.id)
      .select('*')
      .single()
      .throwOnError();

    await supabase
      .from('connected_account_secrets')
      .upsert({
        connected_account_id: existing.id,
        ...secret,
        updated_at: new Date().toISOString(),
      })
      .throwOnError();

    return [account as ConnectedAccountRow];
  }

  const { data: account } = await supabase
    .from('connected_accounts')
    .insert({
      workspace_id: params.workspaceId,
      owner_user_id: params.userId,
      provider: 'slack',
      account_type: 'slack',
      visibility: 'private',
      external_account_id: tokens.slackUserId,
      provider_team_id: tokens.teamId,
      ...details,
    })
    .select('*')
    .single()
    .throwOnError();

  await supabase
    .from('connected_account_secrets')
    .insert({ connected_account_id: account!.id, ...secret })
    .throwOnError();

  return [account as ConnectedAccountRow];
}
