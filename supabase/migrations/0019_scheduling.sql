-- Milestone 5: scheduling with approvals.
--
-- * scheduling_rules: each user's working hours and meeting preferences.
-- * approval_settings: each user's approval level --
--   1 = draft only (Mimus never sends or books),
--   2 = approve every send and booking (the default),
--   3 = replies that only offer times or a Calendly link go out
--       automatically; bookings still need approval,
--   4 = fully automatic.
-- * scheduling_proposals: a drafted scheduling reply, waiting for (or
--   recording) the user's decision.
--
-- All three are the user's alone: not even the workspace Owner can read
-- them, because a proposal is derived from the user's own mail. And a
-- proposal can only be started from a message in the user's *own*
-- connected account -- seeing a teammate's shared inbox is not enough to
-- send from it.
--
-- There is deliberately no UPDATE policy on scheduling_proposals: the only
-- way to move a proposal on is claim_scheduling_proposal(), which checks
-- the caller and the status transition atomically (so a double click can't
-- send twice), and the service role, which records the provider's result.

alter table public.connected_accounts add column scheduling_url text;

-- True when the account belongs to the user. An internal building block
-- for the policies below, revoked from public like get_workspace_role.
create function owns_connected_account(p_account_id uuid, p_uid uuid)
returns boolean
security definer
set search_path = public
stable
language sql
as $$
  select exists (
    select 1 from connected_accounts where id = p_account_id and owner_user_id = p_uid
  );
$$;

revoke all on function owns_connected_account(uuid, uuid) from public;

-- True when the message arrived in the given account and that account
-- belongs to the user.
create function proposal_source_is_own(p_message_id uuid, p_email_account_id uuid, p_uid uuid)
returns boolean
security definer
set search_path = public
stable
language sql
as $$
  select exists (
    select 1
    from messages m
    join connected_accounts ca on ca.id = m.connected_account_id
    where m.id = p_message_id
      and ca.id = p_email_account_id
      and ca.owner_user_id = p_uid
      and ca.account_type = 'email'
  );
$$;

revoke all on function proposal_source_is_own(uuid, uuid, uuid) from public;

create table public.scheduling_rules (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  time_zone text not null default 'UTC',
  -- ISO weekdays, 1 = Monday ... 7 = Sunday.
  working_days int[] not null default '{1,2,3,4,5}',
  work_start time not null default '09:00',
  work_end time not null default '17:00',
  default_duration_minutes int not null default 30 check (default_duration_minutes between 15 and 480),
  buffer_minutes int not null default 0 check (buffer_minutes between 0 and 120),
  min_notice_hours int not null default 4 check (min_notice_hours between 0 and 336),
  offer_count int not null default 3 check (offer_count between 2 and 3),
  prefer_calendly_link boolean not null default false,
  booking_calendar_account_id uuid references public.connected_accounts (id) on delete set null,
  add_video_link boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  check (work_start < work_end),
  check (working_days <@ '{1,2,3,4,5,6,7}')
);

alter table public.scheduling_rules enable row level security;

create policy select_own_scheduling_rules on public.scheduling_rules
  for select using (user_id = auth.uid());

create policy insert_own_scheduling_rules on public.scheduling_rules
  for insert
  with check (
    user_id = auth.uid()
    and get_workspace_role(workspace_id, auth.uid()) is not null
    and (booking_calendar_account_id is null or owns_connected_account(booking_calendar_account_id, auth.uid()))
  );

create policy update_own_scheduling_rules on public.scheduling_rules
  for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (booking_calendar_account_id is null or owns_connected_account(booking_calendar_account_id, auth.uid()))
  );

create table public.approval_settings (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  level smallint not null default 2 check (level between 1 and 4),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.approval_settings enable row level security;

create policy select_own_approval_settings on public.approval_settings
  for select using (user_id = auth.uid());

create policy insert_own_approval_settings on public.approval_settings
  for insert
  with check (user_id = auth.uid() and get_workspace_role(workspace_id, auth.uid()) is not null);

create policy update_own_approval_settings on public.approval_settings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.scheduling_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Cascades: disconnecting an account purges its messages, and with them
  -- every proposal drafted from them.
  source_message_id uuid not null references public.messages (id) on delete cascade,
  email_account_id uuid not null references public.connected_accounts (id) on delete cascade,
  counterpart_emails text[] not null default '{}',
  subject text,
  thread_id text,
  kind text not null check (kind in ('offer_times', 'calendly_link')),
  slots jsonb not null default '[]',
  calendly_url text,
  duration_minutes int not null default 30,
  time_zone text not null default 'UTC',
  draft_body text not null,
  status text not null default 'pending' check (
    status in ('draft_only', 'pending', 'offered', 'executing', 'booked', 'sent', 'rejected')
  ),
  -- What the claim is doing, and the status to return to if it fails.
  pending_action text check (pending_action in ('send_offer', 'send_link', 'book')),
  previous_status text,
  chosen_slot jsonb,
  provider_event_id text,
  provider_sent_message_id text,
  error text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index on public.scheduling_proposals (user_id, status);
create index on public.scheduling_proposals (source_message_id);

alter table public.scheduling_proposals enable row level security;

create policy select_own_scheduling_proposals on public.scheduling_proposals
  for select using (user_id = auth.uid());

create policy insert_own_scheduling_proposals on public.scheduling_proposals
  for insert
  with check (
    user_id = auth.uid()
    and status in ('draft_only', 'pending')
    and get_workspace_role(workspace_id, auth.uid()) is not null
    and proposal_source_is_own(source_message_id, email_account_id, auth.uid())
  );

-- Moves a proposal on, as its own user. 'reject' finishes it; the other
-- actions mark it executing so the caller can do the provider work and
-- record the result with the service role. Errors:
--   P0002  no such proposal for this user
--   22023  the action doesn't fit the proposal's kind
--   55000  the proposal isn't in a status this action can start from
create function claim_scheduling_proposal(p_id uuid, p_action text)
returns public.scheduling_proposals
security definer
set search_path = public
language plpgsql
as $$
declare
  v_proposal scheduling_proposals;
  v_allowed text[];
begin
  select * into v_proposal from scheduling_proposals
  where id = p_id and user_id = auth.uid()
  for update;

  if v_proposal.id is null then
    raise exception 'scheduling proposal not found' using errcode = 'P0002';
  end if;

  if p_action = 'reject' then
    v_allowed := array['pending', 'offered'];
  elsif p_action = 'send_offer' and v_proposal.kind = 'offer_times' then
    v_allowed := array['pending'];
  elsif p_action = 'book' and v_proposal.kind = 'offer_times' then
    v_allowed := array['pending', 'offered'];
  elsif p_action = 'send_link' and v_proposal.kind = 'calendly_link' then
    v_allowed := array['pending'];
  else
    raise exception 'action % does not apply to a % proposal', p_action, v_proposal.kind
      using errcode = '22023';
  end if;

  if not v_proposal.status = any (v_allowed) then
    raise exception 'scheduling proposal is %', v_proposal.status using errcode = '55000';
  end if;

  if p_action = 'reject' then
    update scheduling_proposals
    set status = 'rejected', decided_at = now(), pending_action = null, error = null
    where id = p_id
    returning * into v_proposal;
  else
    update scheduling_proposals
    set status = 'executing', previous_status = v_proposal.status, pending_action = p_action, error = null
    where id = p_id
    returning * into v_proposal;
  end if;

  return v_proposal;
end;
$$;

revoke all on function claim_scheduling_proposal(uuid, text) from public, anon;
grant execute on function claim_scheduling_proposal(uuid, text) to authenticated;
