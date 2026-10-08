import type { NormalizedEvent, NormalizedPerson } from '@/src/server/shared/normalize';
import type { calendar_v3 } from 'googleapis';

function toNormalizedPerson(
  person: { displayName?: string | null; email?: string | null } | null | undefined,
): NormalizedPerson | undefined {
  if (!person) return undefined;
  return { email: person.email ?? undefined, displayName: person.displayName ?? undefined };
}

function toIsoDateTime(dateTime: calendar_v3.Schema$EventDateTime | undefined): string {
  if (dateTime?.dateTime) return new Date(dateTime.dateTime).toISOString();
  if (dateTime?.date) return new Date(dateTime.date).toISOString();
  throw new Error('Calendar event is missing both date and dateTime');
}

export function normalizeCalendarEvent(
  event: calendar_v3.Schema$Event,
  calendarId?: string,
): NormalizedEvent {
  const allDay = Boolean(event.start?.date && !event.start?.dateTime);

  return {
    providerEventId: event.id!,
    calendarId,
    title: event.summary ?? undefined,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    startsAt: toIsoDateTime(event.start),
    endsAt: toIsoDateTime(event.end),
    allDay,
    status: event.status ?? undefined,
    organizer: toNormalizedPerson(event.organizer),
    attendees: event.attendees?.map((attendee) => ({
      person: toNormalizedPerson(attendee)!,
      responseStatus: attendee.responseStatus ?? undefined,
    })),
    raw: event as unknown as Record<string, unknown>,
  };
}
