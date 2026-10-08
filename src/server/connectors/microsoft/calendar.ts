import type { NormalizedEvent, NormalizedPerson } from '@/src/server/shared/normalize';
import type {
  Attendee,
  DateTimeTimeZone,
  Event,
  Recipient,
} from '@microsoft/microsoft-graph-types';

function toNormalizedPerson(recipient: Recipient | null | undefined): NormalizedPerson | undefined {
  const address = recipient?.emailAddress;
  if (!address) return undefined;
  return { email: address.address ?? undefined, displayName: address.name ?? undefined };
}

// Backfill/getAuthorizedGraphClient callers must set the
// `Prefer: outlook.timezone="UTC"` header on every request that returns
// start/end -- Graph's dateTime field is otherwise local wall-clock time in
// whatever zone the timeZone field names, not UTC, and has no offset
// suffix. Trusting that header (rather than attempting zone conversion
// ourselves) is what lets this function safely append "Z".
function toIsoDateTime(dateTime: DateTimeTimeZone | null | undefined): string {
  if (!dateTime?.dateTime) {
    throw new Error('Calendar event is missing start/end dateTime');
  }
  return new Date(`${dateTime.dateTime}Z`).toISOString();
}

export function normalizeCalendarEvent(event: Event, calendarId?: string): NormalizedEvent {
  return {
    providerEventId: event.id!,
    calendarId,
    title: event.subject ?? undefined,
    description: event.body?.content ?? undefined,
    location: event.location?.displayName ?? undefined,
    startsAt: toIsoDateTime(event.start),
    endsAt: toIsoDateTime(event.end),
    allDay: event.isAllDay ?? false,
    status: event.isCancelled ? 'cancelled' : 'confirmed',
    organizer: toNormalizedPerson(event.organizer),
    attendees: (event.attendees ?? []).flatMap((attendee: Attendee) => {
      const person = toNormalizedPerson(attendee);
      if (!person) return [];
      const responseStatus: string | undefined = attendee.status?.response ?? undefined;
      return [{ person, responseStatus }];
    }),
    raw: event as unknown as Record<string, unknown>,
  };
}
