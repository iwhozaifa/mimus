import { normalizeCalendarEvent } from '@/src/server/connectors/microsoft/calendar';
import { describe, expect, it } from 'vitest';
import type { Event } from '@microsoft/microsoft-graph-types';

// Fixtures use bare dateTime strings with timeZone "UTC" -- normalizeCalendarEvent
// trusts the caller to have requested `Prefer: outlook.timezone="UTC"`, so it
// treats these as UTC and appends "Z" itself (see the comment in calendar.ts).
describe('normalizeCalendarEvent', () => {
  it('maps a timed event', () => {
    const fixture: Event = {
      id: 'event-1',
      subject: 'Board sync',
      body: { contentType: 'text', content: 'Quarterly review' },
      location: { displayName: 'Zoom' },
      isCancelled: false,
      isAllDay: false,
      start: { dateTime: '2024-03-15T19:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2024-03-15T20:00:00.0000000', timeZone: 'UTC' },
    };

    const normalized = normalizeCalendarEvent(fixture, 'primary');

    expect(normalized.providerEventId).toBe('event-1');
    expect(normalized.calendarId).toBe('primary');
    expect(normalized.title).toBe('Board sync');
    expect(normalized.description).toBe('Quarterly review');
    expect(normalized.location).toBe('Zoom');
    expect(normalized.status).toBe('confirmed');
    expect(normalized.allDay).toBe(false);
    expect(normalized.startsAt).toBe(new Date('2024-03-15T19:00:00.0000000Z').toISOString());
    expect(normalized.endsAt).toBe(new Date('2024-03-15T20:00:00.0000000Z').toISOString());
  });

  it('marks a cancelled event', () => {
    const fixture: Event = {
      id: 'event-2',
      subject: 'Cancelled sync',
      isCancelled: true,
      start: { dateTime: '2024-03-15T19:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2024-03-15T20:00:00.0000000', timeZone: 'UTC' },
    };
    expect(normalizeCalendarEvent(fixture).status).toBe('cancelled');
  });

  it('maps an all-day event', () => {
    const fixture: Event = {
      id: 'event-3',
      subject: 'Company holiday',
      isAllDay: true,
      start: { dateTime: '2024-07-04T00:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2024-07-05T00:00:00.0000000', timeZone: 'UTC' },
    };

    const normalized = normalizeCalendarEvent(fixture);
    expect(normalized.allDay).toBe(true);
    expect(normalized.startsAt).toBe(new Date('2024-07-04T00:00:00.0000000Z').toISOString());
  });

  it('maps organizer and attendees', () => {
    const fixture: Event = {
      id: 'event-4',
      subject: 'Investor update',
      start: { dateTime: '2024-03-20T10:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2024-03-20T11:00:00.0000000', timeZone: 'UTC' },
      organizer: { emailAddress: { name: 'Jane Founder', address: 'jane@example.com' } },
      attendees: [
        {
          emailAddress: { name: 'Jane Founder', address: 'jane@example.com' },
          status: { response: 'accepted', time: '2024-03-10T00:00:00Z' },
        },
        {
          emailAddress: { address: 'investor@example.com' },
          status: { response: 'notResponded', time: '0001-01-01T00:00:00Z' },
        },
      ],
    };

    const normalized = normalizeCalendarEvent(fixture);

    expect(normalized.organizer).toEqual({
      displayName: 'Jane Founder',
      email: 'jane@example.com',
    });
    expect(normalized.attendees).toEqual([
      {
        person: { displayName: 'Jane Founder', email: 'jane@example.com' },
        responseStatus: 'accepted',
      },
      {
        person: { displayName: undefined, email: 'investor@example.com' },
        responseStatus: 'notResponded',
      },
    ]);
  });
});
