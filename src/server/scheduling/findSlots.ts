// Free meeting slots from busy time and a user's scheduling rules. Pure:
// every input (busy intervals, rules, the clock) is passed in.

export interface Interval {
  start: number;
  end: number;
}

export interface SlotRules {
  timeZone: string;
  // ISO weekdays, 1 = Monday ... 7 = Sunday.
  workingDays: number[];
  // 'HH:MM', in timeZone.
  workStart: string;
  workEnd: string;
  bufferMinutes: number;
  minNoticeHours: number;
}

export interface Slot {
  start: string;
  end: string;
}

export const DEFAULT_RULES: SlotRules = {
  timeZone: 'UTC',
  workingDays: [1, 2, 3, 4, 5],
  workStart: '09:00',
  workEnd: '17:00',
  bufferMinutes: 0,
  minNoticeHours: 4,
};

const STEP_MS = 30 * 60_000;
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function localParts(ms: number, timeZone: string) {
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
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday as string],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

// The local date the slot falls on, or null when it isn't inside working
// hours on a working day.
function workingDate(start: number, end: number, rules: SlotRules): string | null {
  const first = localParts(start, rules.timeZone);
  const last = localParts(end - 1, rules.timeZone);
  if (first.date !== last.date || !rules.workingDays.includes(first.weekday)) return null;
  if (first.minutes < minutesOf(rules.workStart)) return null;
  if (last.minutes + 1 > minutesOf(rules.workEnd)) return null;
  return first.date;
}

export function findSlots(
  busy: Interval[],
  rules: SlotRules,
  options: { from: Date; to: Date; now: Date; durationMinutes: number; count: number },
): Slot[] {
  const durationMs = options.durationMinutes * 60_000;
  const bufferMs = rules.bufferMinutes * 60_000;
  const earliest = Math.max(
    options.from.getTime(),
    options.now.getTime() + rules.minNoticeHours * 3_600_000,
  );

  const candidates: Array<{ start: number; date: string }> = [];
  for (
    let start = Math.ceil(earliest / STEP_MS) * STEP_MS;
    start + durationMs <= options.to.getTime();
    start += STEP_MS
  ) {
    const end = start + durationMs;
    const clear = busy.every((b) => b.end + bufferMs <= start || b.start - bufferMs >= end);
    const date = clear ? workingDate(start, end, rules) : null;
    if (date) candidates.push({ start, date });
  }

  // One slot per day first, so the other person gets a real choice; then
  // top up from whatever is left.
  const picked = new Set<number>();
  const days = new Set<string>();
  for (const candidate of candidates) {
    if (picked.size >= options.count) break;
    if (!days.has(candidate.date)) {
      days.add(candidate.date);
      picked.add(candidate.start);
    }
  }
  for (const candidate of candidates) {
    if (picked.size >= options.count) break;
    picked.add(candidate.start);
  }

  return [...picked]
    .sort((a, b) => a - b)
    .map((start) => ({
      start: new Date(start).toISOString(),
      end: new Date(start + durationMs).toISOString(),
    }));
}
