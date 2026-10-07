-- The AI usage/audit log. Owner-only to read (per spec, no self-visibility
-- exception for the asker), but the write path must never be blocked by
-- that same policy -- log_agent_request is SECURITY DEFINER so logging
-- always succeeds regardless of the caller's own RLS-granted access, and
-- it is the ONLY way into this table: no direct INSERT policy exists.

create table public.agent_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  nature text not null,
  priority text not null,
  model_tier text check (model_tier in ('fast', 'standard', 'deep')),
  model_id text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric,
  source_ids jsonb,
  status text not null,
  created_at timestamptz not null default now()
);

create index on public.agent_logs (workspace_id);

create function log_agent_request(
  p_workspace_id uuid,
  p_user_id uuid,
  p_nature text,
  p_priority text,
  p_model_tier text,
  p_model_id text,
  p_input_tokens int,
  p_output_tokens int,
  p_cost_usd numeric,
  p_source_ids jsonb,
  p_status text
)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into agent_logs (
    workspace_id, user_id, nature, priority, model_tier, model_id,
    input_tokens, output_tokens, cost_usd, source_ids, status
  )
  values (
    p_workspace_id, p_user_id, p_nature, p_priority, p_model_tier, p_model_id,
    p_input_tokens, p_output_tokens, p_cost_usd, p_source_ids, p_status
  )
  returning id into v_id;

  return v_id;
end;
$$;

alter table public.agent_logs enable row level security;

create policy select_agent_logs_owner_only on public.agent_logs
  for select using (get_workspace_role(workspace_id, auth.uid()) = 'owner');
