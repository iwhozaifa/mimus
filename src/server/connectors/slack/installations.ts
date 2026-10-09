import { createServiceClient } from '@/src/db/service';
import {
  bufferToPgBytea,
  decryptToken,
  encryptToken,
  pgByteaToBuffer,
} from '@/src/server/crypto/tokenVault';
import { WebClient } from '@slack/web-api';

// One bot token per Slack workspace (team), captured from the same OAuth
// click that connects a member (see connect.ts) and stored encrypted in
// slack_installations -- see
// supabase/migrations/0017_slack_installations.sql for why it's keyed by
// team rather than by connected account.
export async function saveSlackInstallation(params: {
  teamId: string;
  teamName: string | null;
  botToken: string;
  botUserId: string | null;
  workspaceId: string | null;
}): Promise<void> {
  const { ciphertext, keyVersion } = await encryptToken(params.botToken);
  const supabase = createServiceClient();
  await supabase
    .from('slack_installations')
    .upsert(
      {
        team_id: params.teamId,
        team_name: params.teamName,
        encrypted_bot_token: bufferToPgBytea(ciphertext),
        key_version: keyVersion,
        bot_user_id: params.botUserId,
        installed_by_workspace_id: params.workspaceId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'team_id' },
    )
    .throwOnError();
}

// The team's own bot token, used only to resolve channel membership for
// Events API fan-out (see events.ts): Slack delivers one notification per
// Slack workspace, and this is how ingestion maps it back to which of our
// connected members can actually see the channel it came from.
export async function getBotClient(teamId: string): Promise<WebClient> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('slack_installations')
    .select('encrypted_bot_token, key_version')
    .eq('team_id', teamId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`No Slack installation for team ${teamId}`);
  }

  const botToken = await decryptToken(
    pgByteaToBuffer(data.encrypted_bot_token as string),
    data.key_version as number,
  );
  return new WebClient(botToken);
}

// Drops the stored bot token once no Mimus member in any workspace still
// has that Slack team connected. It's deleted locally, not revoked at
// Slack: revoking a bot token uninstalls the app for the whole Slack
// workspace, which isn't ours to decide.
export async function deleteSlackInstallationIfUnused(teamId: string): Promise<void> {
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from('connected_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('provider', 'slack')
    .eq('provider_team_id', teamId)
    .neq('status', 'disconnected');
  if (error) throw error;
  if ((count ?? 0) > 0) return;

  await supabase.from('slack_installations').delete().eq('team_id', teamId).throwOnError();
}
