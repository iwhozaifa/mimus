-- Daily AI spend rollup per workspace, summed per calendar month (UTC)
-- against plans.ai_spend_cap_usd for the router's 80%-of-cap tier drop.
-- Same posture as agent_logs: Owner-only read, and the only write path is
-- record_agent_spend, which is service-role only (unlike log_agent_request
-- it is revoked from authenticated -- a user who could call it could zero
-- out or inflate their own workspace's spend).

create table public.agent_spend_counters (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null,
  cost_usd numeric not null default 0,
  primary key (workspace_id, day)
);

alter table public.agent_spend_counters enable row level security;

create policy select_agent_spend_counters_owner_only on public.agent_spend_counters
  for select using (get_workspace_role(workspace_id, auth.uid()) = 'owner');

create function record_agent_spend(p_workspace_id uuid, p_day date, p_cost_usd numeric)
returns void
security definer
set search_path = public
language sql
as $$
  insert into agent_spend_counters (workspace_id, day, cost_usd)
  values (p_workspace_id, p_day, p_cost_usd)
  on conflict (workspace_id, day)
  do update set cost_usd = agent_spend_counters.cost_usd + excluded.cost_usd;
$$;

revoke all on function record_agent_spend(uuid, date, numeric) from public, anon, authenticated;
