import { listVisibleSlackMessages } from '@/src/server/connectors/slack/tool';
import { boundedInt, optionalString } from '@/src/server/agent/tools/input';
import type { AgentTool } from '@/src/server/agent/tools/types';

// The AI never touches Slack's API or tokens: it goes through the Slack
// connector's narrow tool surface, under the asker's own session.
export const slackSearch: AgentTool = {
  name: 'slackSearch',
  description: 'Search Slack channel messages the asker can see. Returns newest first.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keywords' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
  async run(ctx, input) {
    const messages = await listVisibleSlackMessages({
      supabase: ctx.supabase,
      askerUserId: ctx.userId,
      workspaceId: ctx.workspaceId,
      query: optionalString(input, 'query'),
      limit: boundedInt(input, 'limit', 20, 1, 50),
    });
    return {
      data: messages.map((message) => ({
        id: message.id,
        text: message.bodyText?.slice(0, 1000) ?? null,
        sentAt: message.sentAt,
        threadId: message.threadId,
      })),
      sources: messages.map((message) => ({
        kind: 'message' as const,
        id: message.id,
        title: message.bodyText?.slice(0, 80) ?? '(Slack message)',
        timestamp: message.sentAt,
        provider: 'slack',
      })),
    };
  },
};
