-- Shared content shapes connectors normalize into (Milestone 2 onward):
-- messages/events/people, plus their many-to-many join tables. Every row
-- carries the connected_account_id it was sourced through, so the same
-- can_see_connected_account() predicate already enforcing the AI boundary
-- on connected_accounts composes directly as each table's RLS policy --
-- no new SQL function needed. There are no insert/update/delete policies
-- at all: connectors write through the service role only (same posture as
-- connected_account_secrets), so these tables are select-only for
-- authenticated users and default-deny for writes.
--
-- people here are external contacts discovered through a connector (an
-- email sender, a meeting attendee) -- never an internal teammate, and not
-- deduplicated across a workspace's multiple connections yet (each row is
-- scoped to the one connected_account_id that discovered it). A
-- canonical_person_id for cross-connector identity resolution can be added
-- later without breaking this invariant.

create table public.people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  connected_account_id uuid not null references public.connected_accounts (id) on delete cascade,
  external_person_id text,
  email text,
  display_name text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.people (workspace_id);
create index on public.people (connected_account_id);
create unique index people_connected_account_id_email_key
  on public.people (connected_account_id, lower(email))
  where email is not null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  connected_account_id uuid not null references public.connected_accounts (id) on delete cascade,
  provider_message_id text not null,
  thread_id text,
  subject text,
  snippet text,
  body_text text,
  body_html text,
  direction text not null check (direction in ('inbound', 'outbound')),
  sent_at timestamptz,
  from_person_id uuid references public.people (id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (connected_account_id, provider_message_id)
);

create index on public.messages (workspace_id);
create index on public.messages (connected_account_id);

create table public.message_participants (
  message_id uuid not null references public.messages (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  role text not null check (role in ('to', 'cc', 'bcc')),
  primary key (message_id, person_id, role)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  connected_account_id uuid not null references public.connected_accounts (id) on delete cascade,
  provider_event_id text not null,
  calendar_id text,
  title text,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  status text,
  organizer_person_id uuid references public.people (id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connected_account_id, provider_event_id)
);

create index on public.events (workspace_id);
create index on public.events (connected_account_id);

create table public.event_attendees (
  event_id uuid not null references public.events (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  response_status text,
  primary key (event_id, person_id)
);

alter table public.people enable row level security;
alter table public.messages enable row level security;
alter table public.message_participants enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;

create policy select_people on public.people
  for select using (can_see_connected_account(connected_account_id, auth.uid()));

create policy select_messages on public.messages
  for select using (can_see_connected_account(connected_account_id, auth.uid()));

create policy select_events on public.events
  for select using (can_see_connected_account(connected_account_id, auth.uid()));

create policy select_message_participants on public.message_participants
  for select using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and can_see_connected_account(m.connected_account_id, auth.uid())
    )
  );

create policy select_event_attendees on public.event_attendees
  for select using (
    exists (
      select 1 from public.events e
      where e.id = event_id and can_see_connected_account(e.connected_account_id, auth.uid())
    )
  );
