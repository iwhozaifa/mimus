import { optionalString, boundedInt } from '@/src/server/agent/tools/input';
import { ToolInputError, type AgentTool } from '@/src/server/agent/tools/types';
import {
  createSchedulingProposal as createProposal,
  ProposalError,
} from '@/src/server/scheduling/proposals';

// Drafts a scheduling reply to an email in the asker's own inbox. What
// happens next is the asker's approval level, not the model's choice: at
// the default level it only waits in Approvals. The reply's text is a
// fixed template, so the model can't write what gets sent either.
export const createSchedulingProposal: AgentTool = {
  name: 'createSchedulingProposal',
  description:
    "Draft a reply offering meeting times (or the asker's Calendly link) to an email in the asker's own inbox. It follows the asker's approval settings; by default it waits in Approvals for them to send.",
  inputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string', description: 'The id of the email to reply to' },
      durationMinutes: { type: 'integer', minimum: 15, maximum: 480 },
    },
    required: ['messageId'],
  },
  async run(ctx, input) {
    const messageId = optionalString(input, 'messageId', 64);
    if (!messageId) throw new ToolInputError('messageId is required');
    const durationMinutes =
      input.durationMinutes === undefined
        ? undefined
        : boundedInt(input, 'durationMinutes', 30, 15, 480);

    let proposal;
    try {
      proposal = await createProposal(ctx, { messageId, durationMinutes });
    } catch (err) {
      if (err instanceof ProposalError) throw new ToolInputError(err.message);
      throw err;
    }

    const { data: message } = await ctx.supabase
      .from('messages')
      .select('id, subject, sent_at, connected_accounts!inner(provider)')
      .eq('id', proposal.source_message_id)
      .single<{
        id: string;
        subject: string | null;
        sent_at: string | null;
        connected_accounts: { provider: string };
      }>();

    return {
      data: {
        status: proposal.status,
        kind: proposal.kind,
        slots: proposal.slots,
        timeZone: proposal.time_zone,
        draft: proposal.draft_body,
        note: proposal.error,
        approvalsUrl: '/approvals',
      },
      sources: message
        ? [
            {
              kind: 'message',
              id: message.id,
              title: message.subject ?? '(no subject)',
              timestamp: message.sent_at,
              provider: message.connected_accounts.provider,
            },
          ]
        : [],
    };
  },
};
