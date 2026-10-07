-- Billing/plan scaffolding (numbers are placeholders until pricing is
-- finalized) and the feature-switch system every "exists but is off"
-- surface (Money, Pipeline, Projects, Canopy) is built against.

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stripe_price_id text,
  feature_defaults jsonb not null default '{}'::jsonb,
  ai_spend_cap_usd numeric,
  seat_limit int,
  created_at timestamptz not null default now()
);

create table public.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  plan_id uuid references public.plans (id),
  stripe_subscription_item_id text,
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'discounted')),
  current_period_end timestamptz
);

-- Per-workspace override of a plan's feature_defaults.
create table public.feature_switches (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  key text not null,
  enabled boolean not null,
  primary key (workspace_id, key)
);

alter table public.plans enable row level security;
alter table public.workspace_subscriptions enable row level security;
alter table public.feature_switches enable row level security;

-- Any workspace member can read plan/subscription/switch state (it gates
-- what UI they see, not sensitive data); only the Owner changes it.
create policy select_plans on public.plans for select using (true);

create policy select_workspace_subscriptions on public.workspace_subscriptions
  for select using (get_workspace_role(workspace_id, auth.uid()) is not null);
create policy manage_workspace_subscriptions on public.workspace_subscriptions
  for all
  using (get_workspace_role(workspace_id, auth.uid()) = 'owner')
  with check (get_workspace_role(workspace_id, auth.uid()) = 'owner');

create policy select_feature_switches on public.feature_switches
  for select using (get_workspace_role(workspace_id, auth.uid()) is not null);
create policy manage_feature_switches on public.feature_switches
  for all
  using (get_workspace_role(workspace_id, auth.uid()) = 'owner')
  with check (get_workspace_role(workspace_id, auth.uid()) = 'owner');
