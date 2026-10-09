import { boundedInt, optionalDate, optionalString } from '@/src/server/agent/tools/input';
import { searchWords } from '@/src/server/shared/searchWords';
import type { AgentTool, Source } from '@/src/server/agent/tools/types';

const EXCERPT_LENGTH = 1500;

interface Row {
  id: string;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  sent_at: string | null;
  direction: string;
  thread_id: string | null;
  connected_accounts: { provider: string };
  from_person: { email: string | null; display_name: string | null } | null;
}

export const searchMessages: AgentTool = {
  name: 'searchMessages',
  description:
    'Search email the asker can see. Every keyword must appear in the subject, snippet or body. Returns newest first.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keywords, e.g. "lease renewal"' },
      after: { type: 'string', description: 'ISO 8601 lower bound on sent time' },
      before: { type: 'string', description: 'ISO 8601 upper bound on sent time' },
      connectedAccountId: { type: 'string', description: 'Limit to one connected account' },
      limit: { type: 'integer', minimum: 1, maximum: 25 },
    },
  },
  async run(ctx, input) {
    const after = optionalDate(input, 'after');
    const before = optionalDate(input, 'before');
    const accountId = optionalString(input, 'connectedAccountId', 64);

    let query = ctx.supabase
      .from('messages')
      .select(
        'id, subject, snippet, body_text, sent_at, direction, thread_id, connected_accounts!inner(provider, account_type), from_person:people!messages_from_person_id_fkey(email, display_name)',
      )
      .eq('workspace_id', ctx.workspaceId)
      .eq('connected_accounts.account_type', 'email');
    for (const word of searchWords(optionalString(input, 'query'))) {
      query = query.or(`subject.ilike.%${word}%,snippet.ilike.%${word}%,body_text.ilike.%${word}%`);
    }
    if (after) query = query.gte('sent_at', after);
    if (before) query = query.lte('sent_at', before);
    if (accountId) query = query.eq('connected_account_id', accountId);

    const { data, error } = await query
      .order('sent_at', { ascending: false, nullsFirst: false })
      .limit(boundedInt(input, 'limit', 10, 1, 25))
      .overrideTypes<Row[], { merge: false }>();
    if (error) throw error;

    const rows = data ?? [];
    return {
      data: rows.map((row) => ({
        id: row.id,
        subject: row.subject,
        from: row.from_person?.display_name ?? row.from_person?.email ?? null,
        fromEmail: row.from_person?.email ?? null,
        sentAt: row.sent_at,
        direction: row.direction,
        threadId: row.thread_id,
        excerpt: (row.body_text ?? row.snippet ?? '').slice(0, EXCERPT_LENGTH),
      })),
      sources: rows.map((row): Source => ({
        kind: 'message',
        id: row.id,
        title: row.subject ?? row.snippet ?? '(no subject)',
        timestamp: row.sent_at,
        provider: row.connected_accounts.provider,
      })),
    };
  },
};
