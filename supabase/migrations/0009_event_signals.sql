-- Durable event-signal queue: connectors (from Milestone 2 onward) emit
-- "message.received"/"event.created"/"meeting.booked" etc. here, and a
-- cron-triggered process fans them out to listener modules. A queue table
-- (not Postgres LISTEN/NOTIFY) so nothing is lost across cold starts.
-- Internal/system-only -- no end user ever reads this directly, so RLS is
-- enabled with no policies and all access goes through the service role.

create table public.event_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  source_connected_account_id uuid references public.connected_accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index on public.event_signals (workspace_id);
create index on public.event_signals (processed_at) where processed_at is null;

alter table public.event_signals enable row level security;
