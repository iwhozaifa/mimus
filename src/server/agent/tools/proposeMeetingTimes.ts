import { boundedInt, optionalString, requiredDate } from '@/src/server/agent/tools/input';
import { ToolInputError, type AgentTool } from '@/src/server/agent/tools/types';

const STEP_MS = 30 * 60_000;
const WORKDAY_START_HOUR = 9;
const WORKDAY_END_HOUR = 17;
const MAX_WINDOW_DAYS = 31;

function zonedParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    weekday: parts.weekday as string,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function isWorkingTime(start: Date, end: Date, timeZone: string): boolean {
  const s = zonedParts(start, timeZone);
  const e = zonedParts(new Date(end.getTime() - 1), timeZone);
  if (s.weekday === 'Sat' || s.weekday === 'Sun' || s.weekday !== e.weekday) return false;
  return s.hour >= WORKDAY_START_HOUR && e.hour < WORKDAY_END_HOUR;
}

// Free slots in the asker's OWN calendars (not teammates' -- even ones they
// can see), on a 30-minute grid inside 9-5 weekdays in their time zone.
// Milestone 5's freeBusy replaces this with real scheduling rules.
export const proposeMeetingTimes: AgentTool = {
  name: 'proposeMeetingTimes',
  description:
    "Propose free meeting slots from the asker's own calendars (weekdays 9:00-17:00 in timeZone).",
  inputSchema: {
    type: 'object',
    properties: {
      durationMinutes: { type: 'integer', minimum: 15, maximum: 480 },
      from: { type: 'string', description: 'ISO 8601 window start' },
      to: { type: 'string', description: 'ISO 8601 window end' },
      timeZone: { type: 'string', description: 'IANA zone, e.g. America/New_York' },
      count: { type: 'integer', minimum: 1, maximum: 10 },
    },
    required: ['durationMinutes', 'from', 'to'],
  },
  async run(ctx, input) {
    const durationMs = boundedInt(input, 'durationMinutes', 30, 15, 480) * 60_000;
    const count = boundedInt(input, 'count', 3, 1, 10);
    const timeZone = optionalString(input, 'timeZone', 64) ?? 'UTC';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
    } catch {
      throw new ToolInputError('timeZone must be an IANA time zone');
    }
    const now = ctx.now ?? new Date();
    const from = new Date(Math.max(new Date(requiredDate(input, 'from')).getTime(), now.getTime()));
    const to = new Date(
      Math.min(
        new Date(requiredDate(input, 'to')).getTime(),
        from.getTime() + MAX_WINDOW_DAYS * 86_400_000,
      ),
    );

    const { data, error } = await ctx.supabase
      .from('events')
      .select('starts_at, ends_at, status, connected_accounts!inner(owner_user_id, account_type)')
      .eq('connected_accounts.owner_user_id', ctx.userId)
      .eq('connected_accounts.account_type', 'calendar')
      .lt('starts_at', to.toISOString())
      .gt('ends_at', from.toISOString());
    if (error) throw error;
    const busy = (data ?? [])
      .filter((event) => event.status !== 'cancelled')
      .map((event) => [new Date(event.starts_at).getTime(), new Date(event.ends_at).getTime()]);

    const slots: Array<{ start: string; end: string }> = [];
    let cursor = Math.ceil(from.getTime() / STEP_MS) * STEP_MS;
    while (slots.length < count && cursor + durationMs <= to.getTime()) {
      const start = new Date(cursor);
      const end = new Date(cursor + durationMs);
      const free = busy.every(([s, e]) => e <= start.getTime() || s >= end.getTime());
      if (free && isWorkingTime(start, end, timeZone)) {
        slots.push({ start: start.toISOString(), end: end.toISOString() });
      }
      cursor += STEP_MS;
    }
    return { data: { timeZone, slots }, sources: [] };
  },
};
