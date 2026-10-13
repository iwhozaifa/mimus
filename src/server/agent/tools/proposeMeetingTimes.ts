import { boundedInt, optionalString, requiredDate } from '@/src/server/agent/tools/input';
import { ToolInputError, type AgentTool } from '@/src/server/agent/tools/types';
import { findSlots } from '@/src/server/scheduling/findSlots';
import { getBusyIntervals } from '@/src/server/scheduling/freeBusy';
import { loadSchedulingRules } from '@/src/server/scheduling/rules';

const MAX_WINDOW_DAYS = 31;

// Free slots across the asker's OWN calendars (not teammates' -- even ones
// they can see), inside the working hours, notice and buffer from their
// scheduling rules.
export const proposeMeetingTimes: AgentTool = {
  name: 'proposeMeetingTimes',
  description:
    "Propose free meeting slots from the asker's own calendars, inside their working hours. Omit timeZone to use the asker's own.",
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
    const rules = await loadSchedulingRules(ctx.supabase, ctx.workspaceId, ctx.userId);
    const durationMinutes = boundedInt(
      input,
      'durationMinutes',
      rules.defaultDurationMinutes,
      15,
      480,
    );
    const count = boundedInt(input, 'count', rules.offerCount, 1, 10);
    const timeZone = optionalString(input, 'timeZone', 64) ?? rules.timeZone;
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

    const { busy, stale } = await getBusyIntervals(ctx, from, to);
    const slots = findSlots(
      busy,
      { ...rules, timeZone },
      { from, to, now, durationMinutes, count },
    );
    return { data: { timeZone, ...(stale ? { stale } : {}), slots }, sources: [] };
  },
};
