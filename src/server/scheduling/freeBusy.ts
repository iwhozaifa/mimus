import { getConnector } from '@/src/server/connectors/bootstrap';
import type { Provider } from '@/src/server/connectors/types';
import type { Interval } from '@/src/server/scheduling/findSlots';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BusyContext {
  // The user's own session: every read below is subject to RLS, and is
  // further narrowed to accounts the user owns -- a teammate's calendar,
  // even a visible one, never blocks the user's time.
  supabase: SupabaseClient;
  userId: string;
}

export interface BusyResult {
  busy: Interval[];
  // True when a provider couldn't be reached and its stored events were
  // used instead, which may be missing recent changes.
  stale: boolean;
}

function merge(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

// Busy time across every calendar the user has connected: live from each
// provider that can answer (Google, Microsoft), plus Mimus's stored events
// for the rest (Calendly bookings) and as the fallback when a live call
// fails.
export async function getBusyIntervals(
  ctx: BusyContext,
  from: Date,
  to: Date,
): Promise<BusyResult> {
  const [{ data: accounts, error: accountsError }, { data: events, error: eventsError }] =
    await Promise.all([
      ctx.supabase
        .from('connected_accounts')
        .select('id, provider')
        .eq('owner_user_id', ctx.userId)
        .eq('status', 'connected')
        .in('account_type', ['calendar', 'scheduling']),
      ctx.supabase
        .from('events')
        .select(
          'connected_account_id, starts_at, ends_at, status, connected_accounts!inner(owner_user_id, account_type)',
        )
        .eq('connected_accounts.owner_user_id', ctx.userId)
        .in('connected_accounts.account_type', ['calendar', 'scheduling'])
        .lt('starts_at', to.toISOString())
        .gt('ends_at', from.toISOString()),
    ]);
  if (accountsError) throw accountsError;
  if (eventsError) throw eventsError;

  let stale = false;
  const live = new Map<string, Interval[]>();
  await Promise.all(
    (accounts ?? []).map(async (account) => {
      const getBusy = getConnector(account.provider as Provider).getBusy;
      if (!getBusy) return;
      try {
        const blocks = await getBusy(account.id, from, to);
        live.set(
          account.id,
          blocks.map((block) => ({
            start: new Date(block.start).getTime(),
            end: new Date(block.end).getTime(),
          })),
        );
      } catch {
        stale = true;
      }
    }),
  );

  const stored = (events ?? [])
    .filter((event) => event.status !== 'cancelled' && !live.has(event.connected_account_id))
    .map((event) => ({
      start: new Date(event.starts_at).getTime(),
      end: new Date(event.ends_at).getTime(),
    }));

  return { busy: merge([...stored, ...[...live.values()].flat()]), stale };
}
