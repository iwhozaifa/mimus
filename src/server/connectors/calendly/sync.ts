import { createServiceClient } from '@/src/db/service';
import { calendlyGet, getDecryptedAccessToken } from '@/src/server/connectors/calendly/client';
import type { NormalizedEvent } from '@/src/server/shared/normalize';
import { upsertEvent } from '@/src/server/shared/normalize';

// No timeMax on the forward side, same reasoning as Google Calendar's
// backfill: a chief-of-staff assistant needs upcoming bookings just as
// much as the past 90 days. Calendly's list endpoint has no "no upper
// bound" option, though, so this picks a generously far one instead.
const PAST_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const FUTURE_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

interface CalendlyLocation {
  type?: string;
  location?: string;
  join_url?: string;
}

interface CalendlyEventMembership {
  user?: string;
  user_email?: string;
  user_name?: string;
}

export interface CalendlyScheduledEvent {
  uri: string;
  name?: string;
  status?: string;
  start_time: string;
  end_time: string;
  location?: CalendlyLocation;
  event_memberships?: CalendlyEventMembership[];
}

export interface CalendlyInvitee {
  uri: string;
  email?: string;
  name?: string;
  status?: string;
}

interface CalendlyPagination {
  next_page_token?: string | null;
}

interface CalendlyCollectionResponse<T> {
  collection: T[];
  pagination?: CalendlyPagination;
}

function locationToString(location: CalendlyLocation | undefined): string | undefined {
  if (!location) return undefined;
  return location.join_url ?? location.location ?? location.type;
}

// Exported so webhook.ts can re-normalize the single event a push
// notification refers to with the exact same logic backfill uses -- one
// normalization path for both ingestion routes, same principle as every
// other connector's shared normalize.ts helpers.
export function normalizeCalendlyEvent(
  event: CalendlyScheduledEvent,
  invitees: CalendlyInvitee[],
): NormalizedEvent {
  const organizerMembership = event.event_memberships?.[0];

  return {
    providerEventId: event.uri,
    title: event.name,
    location: locationToString(event.location),
    startsAt: event.start_time,
    endsAt: event.end_time,
    status: event.status,
    organizer: organizerMembership?.user
      ? {
          externalPersonId: organizerMembership.user,
          email: organizerMembership.user_email,
          displayName: organizerMembership.user_name,
        }
      : undefined,
    attendees: invitees.map((invitee) => ({
      person: {
        externalPersonId: invitee.uri,
        email: invitee.email,
        displayName: invitee.name,
      },
      responseStatus: invitee.status,
    })),
    raw: event as unknown as Record<string, unknown>,
  };
}

function eventUuid(eventUri: string): string {
  return eventUri.split('/').pop()!;
}

async function fetchAllInvitees(accessToken: string, eventUri: string): Promise<CalendlyInvitee[]> {
  const invitees: CalendlyInvitee[] = [];
  let pageToken: string | undefined;
  do {
    const response: CalendlyCollectionResponse<CalendlyInvitee> = pageToken
      ? await calendlyGet(accessToken, `/scheduled_events/${eventUuid(eventUri)}/invitees`, {
          page_token: pageToken,
        })
      : await calendlyGet(accessToken, `/scheduled_events/${eventUuid(eventUri)}/invitees`);
    invitees.push(...response.collection);
    pageToken = response.pagination?.next_page_token ?? undefined;
  } while (pageToken);
  return invitees;
}

// Fetches one event plus its invitees and normalizes them together --
// the one place both the full backfill loop (below) and webhook.ts's
// per-notification re-sync go through, so there's exactly one
// normalization path regardless of how an event was discovered.
export async function syncOneCalendlyEvent(
  accessToken: string,
  eventUri: string,
): Promise<NormalizedEvent> {
  const event = await calendlyGet<CalendlyScheduledEvent>(accessToken, eventUri);
  const invitees = await fetchAllInvitees(accessToken, eventUri);
  return normalizeCalendlyEvent(event, invitees);
}

// Used for both backfill() (once, at connect time) and poll() (the
// cron-driven fallback on Calendly plans without webhooks) -- re-running
// this is always safe: upsertEvent is idempotent on
// (connected_account_id, provider_event_id), so a repeat sync just
// refreshes existing rows (picking up e.g. a cancellation) rather than
// duplicating them.
export async function syncCalendlyAccount(connectedAccountId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: account, error } = await supabase
    .from('connected_accounts')
    .select('workspace_id, external_account_id')
    .eq('id', connectedAccountId)
    .single();
  if (error) throw error;
  const workspaceId = account.workspace_id as string;
  const ownerUri = account.external_account_id as string;

  const accessToken = await getDecryptedAccessToken(connectedAccountId);
  const minStartTime = new Date(Date.now() - PAST_WINDOW_MS).toISOString();
  const maxStartTime = new Date(Date.now() + FUTURE_WINDOW_MS).toISOString();

  let pageToken: string | undefined;
  do {
    // Per Calendly's own pagination guidance, a page_token already
    // encodes the original query -- later pages must not resend
    // min_start_time/max_start_time/user alongside it.
    const response: CalendlyCollectionResponse<CalendlyScheduledEvent> = pageToken
      ? await calendlyGet(accessToken, '/scheduled_events', { page_token: pageToken })
      : await calendlyGet(accessToken, '/scheduled_events', {
          user: ownerUri,
          min_start_time: minStartTime,
          max_start_time: maxStartTime,
          count: '100',
        });

    for (const event of response.collection) {
      const invitees = await fetchAllInvitees(accessToken, event.uri);
      await upsertEvent(workspaceId, connectedAccountId, normalizeCalendlyEvent(event, invitees));
    }

    pageToken = response.pagination?.next_page_token ?? undefined;
  } while (pageToken);

  await supabase
    .from('connected_accounts')
    .update({
      backfill_completed_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', connectedAccountId)
    .throwOnError();
}
