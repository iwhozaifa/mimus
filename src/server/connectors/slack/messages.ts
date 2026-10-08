import type { NormalizedMessage } from '@/src/server/shared/normalize';
import type { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse';

const SNIPPET_LENGTH = 200;

// Slack message `ts` is only unique within one channel, not across a
// workspace, so the provider_message_id has to carry the channel id too
// -- otherwise two different channels' messages sharing a ts (impossible
// in practice, but not guaranteed by the API) could collide under the
// (connected_account_id, provider_message_id) unique constraint.
export function normalizeSlackMessage(
  channelId: string,
  message: MessageElement,
): NormalizedMessage {
  const ts = message.ts!;
  const sentAtMs = Number(ts.split('.')[0]) * 1000;

  return {
    providerMessageId: `${channelId}:${ts}`,
    threadId: message.thread_ts,
    snippet: message.text?.slice(0, SNIPPET_LENGTH),
    bodyText: message.text,
    // Every message this connector ever sees arrived via the connecting
    // member's own read-only token -- nothing is ever sent through Mimus,
    // so there is no 'outbound' case here (unlike email).
    direction: 'inbound',
    sentAt: new Date(sentAtMs).toISOString(),
    from: message.user ? { externalPersonId: message.user } : undefined,
    raw: message as unknown as Record<string, unknown>,
  };
}
