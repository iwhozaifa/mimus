import { getBusyIntervals } from '@/src/server/scheduling/freeBusy';
import { upsertEvent } from '@/src/server/shared/normalize';
import { google } from 'googleapis';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Client } from '@microsoft/microsoft-graph-client';
import { createAgentFixture, type AgentFixture } from '../agent/fixtures';

// The provider API clients are the boundary: googleapis is spied at the
// freebusy prototype, and Microsoft's client builder is mocked (the Graph
// SDK has no prototype seam -- same approach as microsoft/backfill.test.ts).
vi.mock('@/src/server/connectors/google/client', () => ({
  getAuthorizedClient: vi.fn(async () => new google.auth.OAuth2()),
}));
vi.mock('@/src/server/connectors/microsoft/client', () => ({
  getAuthorizedGraphClient: vi.fn(),
}));

import { getAuthorizedGraphClient } from '@/src/server/connectors/microsoft/client';

const freebusy = Object.getPrototypeOf(
  google.calendar({ version: 'v3', auth: new google.auth.OAuth2() }).freebusy,
);

function fakeGraph(value: unknown[]): Client {
  const chain = {
    query: () => chain,
    header: () => chain,
    top: () => chain,
    get: async () => ({ value }),
  };
  return { api: vi.fn(() => chain) } as unknown as Client;
}

const iso = (ms: number) => new Date(ms).toISOString();

describe('getBusyIntervals (real local Supabase, provider APIs mocked)', () => {
  let fx: AgentFixture;
  let ctx: { supabase: Awaited<ReturnType<AgentFixture['signIn']>>; userId: string };
  const from = new Date('2026-10-13T00:00:00Z');
  const to = new Date('2026-10-14T00:00:00Z');

  beforeAll(async () => {
    fx = await createAgentFixture('Free busy');
    await fx.connect(fx.alice, 'google', 'calendar');
    await fx.connect(fx.alice, 'microsoft', 'calendar');
    const calendly = await fx.connect(fx.alice, 'calendly', 'scheduling');
    const bobCalendar = await fx.connect(fx.bob, 'google', 'calendar', 'company');

    // A Calendly booking only Mimus's database knows about.
    await upsertEvent(fx.workspaceId, calendly, {
      providerEventId: 'cal-1',
      title: 'Intro call',
      startsAt: '2026-10-13T15:00:00Z',
      endsAt: '2026-10-13T15:30:00Z',
    });
    // A teammate's event never blocks Alice's time, even when she can see it.
    await upsertEvent(fx.workspaceId, bobCalendar, {
      providerEventId: 'bob-1',
      title: 'Bob offsite',
      startsAt: '2026-10-13T06:00:00Z',
      endsAt: '2026-10-13T18:00:00Z',
    });

    ctx = { supabase: await fx.signIn(fx.alice), userId: fx.alice.id };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await fx.cleanup();
  });

  it('merges busy time from Google, Microsoft and stored Calendly bookings', async () => {
    const query = vi.spyOn(freebusy, 'query').mockResolvedValue({
      data: {
        calendars: {
          primary: {
            busy: [
              { start: '2026-10-13T09:00:00Z', end: '2026-10-13T10:00:00Z' },
              { start: '2026-10-13T09:30:00Z', end: '2026-10-13T11:00:00Z' },
            ],
          },
        },
      },
    } as never);
    vi.mocked(getAuthorizedGraphClient).mockResolvedValue(
      fakeGraph([
        {
          start: { dateTime: '2026-10-13T13:00:00.0000000', timeZone: 'UTC' },
          end: { dateTime: '2026-10-13T14:00:00.0000000', timeZone: 'UTC' },
          showAs: 'busy',
          isCancelled: false,
        },
        {
          start: { dateTime: '2026-10-13T16:00:00.0000000', timeZone: 'UTC' },
          end: { dateTime: '2026-10-13T17:00:00.0000000', timeZone: 'UTC' },
          showAs: 'free',
          isCancelled: false,
        },
      ]),
    );

    const result = await getBusyIntervals(ctx, from, to);

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
        }),
      }),
    );
    expect(result.stale).toBe(false);
    expect(result.busy.map(({ start, end }) => [iso(start), iso(end)])).toEqual([
      ['2026-10-13T09:00:00.000Z', '2026-10-13T11:00:00.000Z'],
      ['2026-10-13T13:00:00.000Z', '2026-10-13T14:00:00.000Z'],
      ['2026-10-13T15:00:00.000Z', '2026-10-13T15:30:00.000Z'],
    ]);
  });

  it('falls back to stored events and says so when a provider call fails', async () => {
    vi.spyOn(freebusy, 'query').mockRejectedValue(new Error('Google is down'));
    vi.mocked(getAuthorizedGraphClient).mockResolvedValue(fakeGraph([]));

    const result = await getBusyIntervals(ctx, from, to);

    expect(result.stale).toBe(true);
    expect(result.busy.map(({ start, end }) => [iso(start), iso(end)])).toEqual([
      ['2026-10-13T15:00:00.000Z', '2026-10-13T15:30:00.000Z'],
    ]);
  });
});
