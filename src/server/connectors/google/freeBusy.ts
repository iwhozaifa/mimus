import { getAuthorizedClient } from '@/src/server/connectors/google/client';
import { withGoogleRateLimitRetry } from '@/src/server/connectors/google/retry';
import type { BusyInterval } from '@/src/server/connectors/types';
import { google } from 'googleapis';

// Busy blocks on the account's primary calendar. freebusy.query is covered
// by the read-only calendar scope Mimus already holds.
export async function getGoogleBusy(
  connectedAccountId: string,
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  const calendar = google.calendar({
    version: 'v3',
    auth: await getAuthorizedClient(connectedAccountId),
  });
  const response = await withGoogleRateLimitRetry(() =>
    calendar.freebusy.query({
      requestBody: {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        items: [{ id: 'primary' }],
      },
    }),
  );
  const primary = response.data.calendars?.primary;
  if (primary?.errors?.length) {
    throw new Error(`Google free/busy failed: ${primary.errors.map((e) => e.reason).join(', ')}`);
  }
  return (primary?.busy ?? [])
    .filter((block) => block.start && block.end)
    .map((block) => ({ start: block.start!, end: block.end! }));
}
