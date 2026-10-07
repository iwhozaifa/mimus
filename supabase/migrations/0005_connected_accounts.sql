-- Connected accounts, the Owner-curated Company-visibility allow-list, and
-- the vault for their tokens. This is where the AI-boundary rule --
-- "the AI can only see what the asker could see themselves" -- actually
-- gets enforced: at the database, via RLS, not in application code.

create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft', 'slack', 'calendly')),
  account_type text not null check (account_type in ('email', 'calendar', 'slack', 'scheduling')),
  visibility text not null default 'private' check (visibility in ('private', 'team', 'company')),
  external_account_id text,
  scopes text[],
  status text not null default 'connected' check (status in ('connected', 'needs_reauth', 'error', 'disconnected')),
  backfill_completed_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  disconnected_at timestamptz
);

create index on public.connected_accounts (workspace_id);
create index on public.connected_accounts (owner_user_id);

-- Isolated so no policy on connected_accounts can accidentally expose
-- tokens: this table carries no RLS policies at all, and all access is
-- explicitly revoked from the roles end users authenticate as.
create table public.connected_account_secrets (
  connected_account_id uuid primary key references public.connected_accounts (id) on delete cascade,
  encrypted_access_token bytea,
  encrypted_refresh_token bytea,
  key_version int,
  updated_at timestamptz not null default now()
);

-- The workspace Owner's allow-list for who else may see a Company-visibility
-- connection.
create table public.connected_account_shares (
  connected_account_id uuid not null references public.connected_accounts (id) on delete cascade,
  shared_with_user_id uuid not null references auth.users (id) on delete cascade,
  primary key (connected_account_id, shared_with_user_id)
);

-- Private: only the connector. Team: the connector, their manager, peers
-- under the same manager, and the workspace owner. Company: the workspace
-- owner, plus anyone on the owner's allow-list. (Private has no owner
-- bypass -- the owner's AI does not search employees' Private accounts.)
create function can_see_connected_account(p_account_id uuid, p_uid uuid)
returns boolean
security definer
set search_path = public
stable
language plpgsql
as $$
declare
  v_account connected_accounts;
  v_actor_role text;
  v_owner_manager_id uuid;
  v_actor_membership_id uuid;
  v_actor_manager_id uuid;
begin
  select * into v_account from connected_accounts where id = p_account_id;
  if v_account is null then
    return false;
  end if;

  if v_account.owner_user_id = p_uid then
    return true;
  end if;

  v_actor_role := get_workspace_role(v_account.workspace_id, p_uid);
  if v_actor_role is null then
    return false;
  end if;

  if v_account.visibility = 'company' then
    if v_actor_role = 'owner' then
      return true;
    end if;
    return exists (
      select 1 from connected_account_shares
      where connected_account_id = p_account_id and shared_with_user_id = p_uid
    );
  end if;

  if v_account.visibility = 'team' then
    if v_actor_role = 'owner' then
      return true;
    end if;

    select manager_id into v_owner_manager_id
    from workspace_members
    where workspace_id = v_account.workspace_id and user_id = v_account.owner_user_id;

    select id, manager_id into v_actor_membership_id, v_actor_manager_id
    from workspace_members
    where workspace_id = v_account.workspace_id and user_id = p_uid;

    return v_actor_membership_id = v_owner_manager_id
      or (v_actor_manager_id is not null and v_actor_manager_id = v_owner_manager_id);
  end if;

  return false;
end;
$$;

revoke all on function can_see_connected_account(uuid, uuid) from public;

alter table public.connected_accounts enable row level security;
alter table public.connected_account_shares enable row level security;
alter table public.connected_account_secrets enable row level security;
revoke all on public.connected_account_secrets from authenticated, anon;

create policy select_connected_accounts on public.connected_accounts
  for select using (can_see_connected_account(id, auth.uid()));

-- Connecting your own account is always allowed; connecting on someone
-- else's behalf, or starting above Private visibility, requires Owner/Manager.
create policy insert_connected_accounts on public.connected_accounts
  for insert
  with check (
    get_workspace_role(workspace_id, auth.uid()) is not null
    and (owner_user_id = auth.uid() or get_workspace_role(workspace_id, auth.uid()) in ('owner', 'manager'))
    and (visibility = 'private' or get_workspace_role(workspace_id, auth.uid()) in ('owner', 'manager'))
  );

create policy update_connected_accounts on public.connected_accounts
  for update
  using (owner_user_id = auth.uid() or get_workspace_role(workspace_id, auth.uid()) = 'owner')
  with check (visibility = 'private' or get_workspace_role(workspace_id, auth.uid()) in ('owner', 'manager'));

create policy delete_connected_accounts on public.connected_accounts
  for delete
  using (owner_user_id = auth.uid() or get_workspace_role(workspace_id, auth.uid()) = 'owner');

-- Only the workspace Owner curates the Company-visibility allow-list.
create policy manage_connected_account_shares on public.connected_account_shares
  for all
  using (exists (
    select 1 from connected_accounts ca
    where ca.id = connected_account_id and get_workspace_role(ca.workspace_id, auth.uid()) = 'owner'
  ))
  with check (exists (
    select 1 from connected_accounts ca
    where ca.id = connected_account_id and get_workspace_role(ca.workspace_id, auth.uid()) = 'owner'
  ));
