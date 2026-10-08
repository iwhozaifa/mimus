import { createServiceClient } from '@/src/db/service';
import { getAuthorizedClient } from '@/src/server/connectors/slack/client';
import { normalizeSlackMessage } from '@/src/server/connectors/slack/messages';
import { upsertMessage } from '@/src/server/shared/normalize';

const BACKFILL_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

// public_channel + private_channel only -- no im/mpim, matching the
// scopes requested in oauth.ts. users.conversations (not
// conversations.list) is what actually scopes the result to channels
// *this user* is a member of; conversations.list with a user token would
// also return public channels the user has never joined.
const CHANNEL_TYPES = 'public_channel,private_channel';

async function backfillChannelHistory(
  client: Awaited<ReturnType<typeof getAuthorizedClient>>,
  workspaceId: string,
  connectedAccountId: string,
  channelId: string,
  oldest: string,
): Promise<void> {
  let cursor: string | undefined;
  do {
    const { messages, has_more, response_metadata } = await client.conversations.history({
      channel: channelId,
      oldest,
      cursor,
      limit: 200,
    });

    for (const message of messages ?? []) {
      if (!message.ts) continue;
      await upsertMessage(
        workspaceId,
        connectedAccountId,
        normalizeSlackMessage(channelId, message),
      );
    }

    cursor = has_more ? response_metadata?.next_cursor : undefined;
  } while (cursor);
}

export async function backfillSlackAccount(connectedAccountId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: account, error } = await supabase
    .from('connected_accounts')
    .select('workspace_id')
    .eq('id', connectedAccountId)
    .single();
  if (error) throw error;
  const workspaceId = account.workspace_id as string;

  const client = await getAuthorizedClient(connectedAccountId);
  // Slack's oldest/latest cursors are fractional-second unix timestamps
  // as strings, not ISO dates.
  const oldest = ((Date.now() - BACKFILL_WINDOW_MS) / 1000).toFixed(6);

  let cursor: string | undefined;
  do {
    const { channels, response_metadata } = await client.users.conversations({
      types: CHANNEL_TYPES,
      exclude_archived: true,
      cursor,
      limit: 200,
    });

    for (const channel of channels ?? []) {
      if (!channel.id) continue;
      await backfillChannelHistory(client, workspaceId, connectedAccountId, channel.id, oldest);
    }

    cursor = response_metadata?.next_cursor || undefined;
  } while (cursor);

  await supabase
    .from('connected_accounts')
    .update({ backfill_completed_at: new Date().toISOString() })
    .eq('id', connectedAccountId)
    .throwOnError();
}
