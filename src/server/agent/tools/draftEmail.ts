import { optionalString, requiredString, stringList } from '@/src/server/agent/tools/input';
import { ToolInputError, type AgentTool, type Source } from '@/src/server/agent/tools/types';

// Drafts only. Nothing here can send: sending goes through the approval
// flow (Milestone 5), never straight from a model's tool call.
export const draftEmail: AgentTool = {
  name: 'draftEmail',
  description:
    'Draft an email (optionally replying to a message the asker can see). Never sends -- the founder reviews it first.',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'array', items: { type: 'string' } },
      subject: { type: 'string' },
      body: { type: 'string' },
      inReplyToMessageId: { type: 'string', description: 'Message id from searchMessages' },
    },
    required: ['to', 'subject', 'body'],
  },
  async run(ctx, input) {
    const to = stringList(input, 'to');
    const subject = requiredString(input, 'subject', 500);
    const body = requiredString(input, 'body');
    const inReplyTo = optionalString(input, 'inReplyToMessageId', 64);

    const sources: Source[] = [];
    let threadId: string | null = null;
    if (inReplyTo) {
      const { data: original, error } = await ctx.supabase
        .from('messages')
        .select('id, subject, sent_at, thread_id, connected_accounts!inner(provider)')
        .eq('id', inReplyTo)
        .maybeSingle<{
          id: string;
          subject: string | null;
          sent_at: string | null;
          thread_id: string | null;
          connected_accounts: { provider: string };
        }>();
      if (error) throw error;
      // RLS hides another member's private message, so it reads as missing.
      if (!original) throw new ToolInputError('That message was not found.');
      threadId = original.thread_id;
      sources.push({
        kind: 'message',
        id: original.id,
        title: original.subject ?? '(no subject)',
        timestamp: original.sent_at,
        provider: original.connected_accounts.provider,
      });
    }

    return {
      data: {
        status: 'draft',
        sent: false,
        to,
        subject,
        body,
        inReplyToMessageId: inReplyTo ?? null,
        threadId,
      },
      sources,
    };
  },
};
