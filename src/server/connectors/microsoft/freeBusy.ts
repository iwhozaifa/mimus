import { getAuthorizedGraphClient } from '@/src/server/connectors/microsoft/client';
import type { BusyInterval } from '@/src/server/connectors/types';
import type { Event } from '@microsoft/microsoft-graph-types';

const PAGE_SIZE = 500;

// Busy blocks on the account's default calendar, from calendarView (covered
// by the read-only Calendars.Read scope Mimus already holds). Times come
// back in UTC because of the Prefer header, without a zone suffix.
export async function getMicrosoftBusy(
  connectedAccountId: string,
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  const client = await getAuthorizedGraphClient(connectedAccountId);
  const busy: BusyInterval[] = [];
  let request = client
    .api('/me/calendarView')
    .query({
      startDateTime: from.toISOString(),
      endDateTime: to.toISOString(),
      $select: 'start,end,showAs,isCancelled',
    })
    .header('Prefer', 'outlook.timezone="UTC"')
    .top(PAGE_SIZE);

  for (;;) {
    const page: { value: Event[]; '@odata.nextLink'?: string } = await request.get();
    for (const event of page.value) {
      if (event.isCancelled || event.showAs === 'free') continue;
      if (!event.start?.dateTime || !event.end?.dateTime) continue;
      busy.push({
        start: new Date(`${event.start.dateTime}Z`).toISOString(),
        end: new Date(`${event.end.dateTime}Z`).toISOString(),
      });
    }
    const next = page['@odata.nextLink'];
    if (!next) return busy;
    request = client.api(next);
  }
}
