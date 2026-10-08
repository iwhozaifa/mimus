import { createServiceClient } from '@/src/db/service';
import { getBotClient } from '@/src/server/connectors/slack/client';
import { normalizeSlackMessage } from '@/src/server/connectors/slack/messages';
import { verifySlackSignature } from '@/src/server/connectors/slack/signature';
import { upsertMessage } from '@/src/server/shared/normalize';
import type { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse';

const INGESTED_EVENT_TYPES = new Set(['message', 'app_mention']);

// Slack's own channel_type values on a message event -- 'channel'
// (public) and 'group' (private) only. 'im'/'mpim' should never actually
// reach here, since the bot has no im:history/mpim:history scope and no
// such event subscription exists, but this filter is kept as defense in
// depth matching the "no DMs" requirement already enforced at the OAuth
// scope layer (see oauth.test.ts).
const ALLOWED_CHANNEL_TYPES = new Set(['channel', 'group']);

interface SlackEventPayload extends MessageElement {
  type?: string;
  channel?: string;
  channel_type?: string;
}

interface SlackEventBody {
  type?: string;
  challenge?: string;
  team_id?: string;
  event?: SlackEventPayload;
}

// Resolves which of our own connected members can actually see this
// channel, via the single app-wide bot token -- the one place this
// connector reads with something other than a member's own token,
// because membership has to be known *before* any member-scoped action
// makes sense. The member-scoped guarantee lives in what gets written
// afterward: a message is only ever upserted into a connected_account
// whose own external_account_id came back in this member list.
async function membersOfChannel(channelId: string): Promise<Set<string>> {
  const bot = getBotClient();
  const members = new Set<string>();
  let cursor: string | undefined;
  do {
    const { members: page, response_metadata } = await bot.conversations.members({
      channel: channelId,
      cursor,
      limit: 200,
    });
    for (const id of page ?? []) members.add(id);
    cursor = response_metadata?.next_cursor || undefined;
  } while (cursor);
  return members;
}

async function ingestChannelEvent(teamId: string, event: SlackEventPayload): Promise<void> {
  if (!event.channel || !event.ts) return;
  if (event.channel_type && !ALLOWED_CHANNEL_TYPES.has(event.channel_type)) return;

  const supabase = createServiceClient();
  const { data: accounts, error } = await supabase
    .from('connected_accounts')
    .select('id, workspace_id, external_account_id')
    .eq('provider', 'slack')
    .eq('provider_team_id', teamId)
    .eq('status', 'connected');
  if (error) throw error;
  if (!accounts?.length) return;

  const members = await membersOfChannel(event.channel);
  const normalized = normalizeSlackMessage(event.channel, event);

  for (const account of accounts) {
    if (!members.has(account.external_account_id as string)) continue;
    await upsertMessage(account.workspace_id as string, account.id as string, normalized);
  }
}

export async function handleSlackEvent(request: Request): Promise<Response> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    throw new Error('SLACK_SIGNING_SECRET is not configured');
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get('x-slack-request-timestamp');
  const signature = request.headers.get('x-slack-signature');
  if (!verifySlackSignature({ signingSecret, timestamp, signature, rawBody })) {
    return new Response('invalid signature', { status: 401 });
  }

  const body = JSON.parse(rawBody) as SlackEventBody;

  // Must be answered within 3 seconds with the raw challenge value, no
  // signature-independent fallback -- this is how Slack confirms the
  // endpoint before ever enabling real event delivery to it.
  if (body.type === 'url_verification') {
    return Response.json({ challenge: body.challenge });
  }

  if (
    body.type === 'event_callback' &&
    body.team_id &&
    body.event?.type &&
    INGESTED_EVENT_TYPES.has(body.event.type)
  ) {
    await ingestChannelEvent(body.team_id, body.event);
  }

  return new Response(null, { status: 204 });
}
