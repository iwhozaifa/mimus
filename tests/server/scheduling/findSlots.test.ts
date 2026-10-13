import { DEFAULT_RULES, findSlots, type SlotRules } from '@/src/server/scheduling/findSlots';
import { describe, expect, it } from 'vitest';

const at = (iso: string) => new Date(iso).getTime();

function slots(
  busy: Array<[string, string]>,
  rules: Partial<SlotRules>,
  options: { from: string; to: string; now: string; durationMinutes?: number; count?: number },
) {
  return findSlots(
    busy.map(([start, end]) => ({ start: at(start), end: at(end) })),
    { ...DEFAULT_RULES, ...rules },
    {
      from: new Date(options.from),
      to: new Date(options.to),
      now: new Date(options.now),
      durationMinutes: options.durationMinutes ?? 30,
      count: options.count ?? 3,
    },
  );
}

describe('findSlots', () => {
  it('spreads the offered slots across different days before doubling up', () => {
    // Mon 2026-10-12 to Wed 2026-10-14, UTC, 9-17.
    expect(
      slots(
        [],
        { minNoticeHours: 0 },
        {
          from: '2026-10-12T00:00:00Z',
          to: '2026-10-15T00:00:00Z',
          now: '2026-10-11T00:00:00Z',
        },
      ),
    ).toEqual([
      { start: '2026-10-12T09:00:00.000Z', end: '2026-10-12T09:30:00.000Z' },
      { start: '2026-10-13T09:00:00.000Z', end: '2026-10-13T09:30:00.000Z' },
      { start: '2026-10-14T09:00:00.000Z', end: '2026-10-14T09:30:00.000Z' },
    ]);
  });

  it('fills from the same day once every day has a slot', () => {
    expect(
      slots(
        [],
        { minNoticeHours: 0 },
        {
          from: '2026-10-12T00:00:00Z',
          to: '2026-10-13T00:00:00Z',
          now: '2026-10-11T00:00:00Z',
          durationMinutes: 60,
        },
      ),
    ).toEqual([
      { start: '2026-10-12T09:00:00.000Z', end: '2026-10-12T10:00:00.000Z' },
      { start: '2026-10-12T09:30:00.000Z', end: '2026-10-12T10:30:00.000Z' },
      { start: '2026-10-12T10:00:00.000Z', end: '2026-10-12T11:00:00.000Z' },
    ]);
  });

  it('skips busy time, keeping the buffer clear on both sides', () => {
    expect(
      slots(
        [['2026-10-12T09:00:00Z', '2026-10-12T12:00:00Z']],
        { minNoticeHours: 0, bufferMinutes: 15 },
        {
          from: '2026-10-12T00:00:00Z',
          to: '2026-10-13T00:00:00Z',
          now: '2026-10-11T00:00:00Z',
          count: 2,
        },
      ),
    ).toEqual([
      { start: '2026-10-12T12:30:00.000Z', end: '2026-10-12T13:00:00.000Z' },
      { start: '2026-10-12T13:00:00.000Z', end: '2026-10-12T13:30:00.000Z' },
    ]);
  });

  it('never offers a slot inside the minimum notice', () => {
    expect(
      slots(
        [],
        { minNoticeHours: 4 },
        {
          from: '2026-10-12T00:00:00Z',
          to: '2026-10-13T00:00:00Z',
          now: '2026-10-12T10:10:00Z',
          count: 1,
        },
      ),
    ).toEqual([{ start: '2026-10-12T14:30:00.000Z', end: '2026-10-12T15:00:00.000Z' }]);
  });

  it('only uses the working days and hours, in the rules’ time zone', () => {
    // Asia/Karachi is UTC+5: 10:00-12:00 there is 05:00-07:00 UTC.
    // Sat 2026-10-17 and Sun 2026-10-18 are skipped; Mon 2026-10-19 is used.
    expect(
      slots(
        [],
        { minNoticeHours: 0, timeZone: 'Asia/Karachi', workStart: '10:00', workEnd: '12:00' },
        {
          from: '2026-10-17T00:00:00Z',
          to: '2026-10-20T00:00:00Z',
          now: '2026-10-16T00:00:00Z',
          durationMinutes: 120,
          count: 2,
        },
      ),
    ).toEqual([{ start: '2026-10-19T05:00:00.000Z', end: '2026-10-19T07:00:00.000Z' }]);
  });

  it('follows daylight saving time changes', () => {
    // New York leaves DST on Sun 2026-11-01: 9:00 local is 13:00 UTC on
    // Fri 2026-10-30 and 14:00 UTC on Mon 2026-11-02.
    expect(
      slots(
        [],
        { minNoticeHours: 0, timeZone: 'America/New_York' },
        {
          from: '2026-10-30T00:00:00Z',
          to: '2026-11-03T00:00:00Z',
          now: '2026-10-29T00:00:00Z',
          count: 2,
        },
      ),
    ).toEqual([
      { start: '2026-10-30T13:00:00.000Z', end: '2026-10-30T13:30:00.000Z' },
      { start: '2026-11-02T14:00:00.000Z', end: '2026-11-02T14:30:00.000Z' },
    ]);
  });

  it('honours a custom set of working days', () => {
    expect(
      slots(
        [],
        { minNoticeHours: 0, workingDays: [6] },
        {
          from: '2026-10-12T00:00:00Z',
          to: '2026-10-19T00:00:00Z',
          now: '2026-10-11T00:00:00Z',
          count: 1,
        },
      ),
    ).toEqual([{ start: '2026-10-17T09:00:00.000Z', end: '2026-10-17T09:30:00.000Z' }]);
  });
});
