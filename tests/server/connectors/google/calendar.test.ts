import { normalizeCalendarEvent } from '@/src/server/connectors/google/calendar';
import { describe, expect, it } from 'vitest';
import type { calendar_v3 } from 'googleapis';

describe('normalizeCalendarEvent', () => {
  it('maps a timed event', () => {
    const fixture: calendar_v3.Schema$Event = {
      id: 'event-1',
      summary: 'Board sync',
      description: 'Quarterly review',
      location: 'Zoom',
      status: 'confirmed',
      start: { dateTime: '2024-03-15T15:00:00-04:00', timeZone: 'America/New_York' },
      end: { dateTime: '2024-03-15T16:00:00-04:00', timeZone: 'America/New_York' },
    };

    const normalized = normalizeCalendarEvent(fixture, 'primary');

    expect(normalized.providerEventId).toBe('event-1');
    expect(normalized.calendarId).toBe('primary');
    expect(normalized.title).toBe('Board sync');
    expect(normalized.description).toBe('Quarterly review');
    expect(normalized.location).toBe('Zoom');
    expect(normalized.status).toBe('confirmed');
    expect(normalized.allDay).toBe(false);
    expect(normalized.startsAt).toBe(new Date('2024-03-15T15:00:00-04:00').toISOString());
    expect(normalized.endsAt).toBe(new Date('2024-03-15T16:00:00-04:00').toISOString());
  });

  it('maps an all-day event using the date-only field', () => {
    const fixture: calendar_v3.Schema$Event = {
      id: 'event-2',
      summary: 'Company holiday',
      start: { date: '2024-07-04' },
      end: { date: '2024-07-05' },
    };

    const normalized = normalizeCalendarEvent(fixture);

    expect(normalized.allDay).toBe(true);
    expect(normalized.startsAt).toBe(new Date('2024-07-04').toISOString());
    expect(normalized.endsAt).toBe(new Date('2024-07-05').toISOString());
  });

  it('maps organizer and attendees', () => {
    const fixture: calendar_v3.Schema$Event = {
      id: 'event-3',
      summary: 'Investor update',
      start: { dateTime: '2024-03-20T10:00:00Z' },
      end: { dateTime: '2024-03-20T11:00:00Z' },
      organizer: { displayName: 'Jane Founder', email: 'jane@example.com' },
      attendees: [
        {
          displayName: 'Jane Founder',
          email: 'jane@example.com',
          organizer: true,
          responseStatus: 'accepted',
        },
        { email: 'investor@example.com', responseStatus: 'needsAction' },
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
        responseStatus: 'needsAction',
      },
    ]);
  });
});
