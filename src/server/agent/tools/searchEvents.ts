import { boundedInt, optionalDate, optionalString } from '@/src/server/agent/tools/input';
import { searchWords } from '@/src/server/shared/searchWords';
import type { AgentTool, Source } from '@/src/server/agent/tools/types';

interface Row {
  id: string;
  title: string | null;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  status: string | null;
  connected_accounts: { provider: string };
}

export const searchEvents: AgentTool = {
  name: 'searchEvents',
  description:
    'Search calendar events the asker can see, optionally by keyword and time window. Returns earliest first.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keywords matched against title/description/location' },
      from: { type: 'string', description: 'ISO 8601: events ending after this' },
      to: { type: 'string', description: 'ISO 8601: events starting before this' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
  async run(ctx, input) {
    const from = optionalDate(input, 'from');
    const to = optionalDate(input, 'to');

    let query = ctx.supabase
      .from('events')
      .select(
        'id, title, description, location, starts_at, ends_at, all_day, status, connected_accounts!inner(provider)',
      )
      .eq('workspace_id', ctx.workspaceId);
    for (const word of searchWords(optionalString(input, 'query'))) {
      query = query.or(
        `title.ilike.%${word}%,description.ilike.%${word}%,location.ilike.%${word}%`,
      );
    }
    if (from) query = query.gt('ends_at', from);
    if (to) query = query.lt('starts_at', to);

    const { data, error } = await query
      .order('starts_at', { ascending: true })
      .limit(boundedInt(input, 'limit', 20, 1, 50))
      .overrideTypes<Row[], { merge: false }>();
    if (error) throw error;

    const rows = data ?? [];
    return {
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        allDay: row.all_day,
        location: row.location,
        status: row.status,
        description: row.description?.slice(0, 500) ?? null,
      })),
      sources: rows.map((row): Source => ({
        kind: 'event',
        id: row.id,
        title: row.title ?? '(untitled event)',
        timestamp: row.starts_at,
        provider: row.connected_accounts.provider,
      })),
    };
  },
};
